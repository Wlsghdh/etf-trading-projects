"""
Prediction Service - AhnLab LightGBM LambdaRank ranking predictions.

Provides ranking-based predictions for all symbols using the AhnLab
LightGBM ensemble model. Features are read from etf2_db_processed.
"""
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import logging

import numpy as np
import pandas as pd

from app.models import Prediction
from app.services.model_loader import ModelLoader, get_model_loader, ModelMetadata, XGBRegressorEnsemble
from app.services.processed_data_service import ProcessedDataService, ALL_FEATURE_COLS

logger = logging.getLogger(__name__)


class PredictionService:
    """AhnLab LightGBM ranking prediction service."""

    def __init__(
        self,
        processed_db: Session,
        local_db: Session,
        model_loader: Optional[ModelLoader] = None,
    ):
        self.processed_db = processed_db
        self.local_db = local_db
        self.data_service = ProcessedDataService(processed_db)
        self.model_loader = model_loader or get_model_loader()

        # Try to load AhnLab model
        self._ensure_model_loaded()
        logger.info("PredictionService initialized with AhnLab LightGBM model")

    def _ensure_model_loaded(self) -> None:
        """Ensure the AhnLab model is loaded."""
        try:
            current = self.model_loader.get_current_metadata()
            if current is None or current.name != "ahnlab_lgbm":
                self.model_loader.load_model("ahnlab_lgbm")
        except FileNotFoundError:
            logger.warning(
                "AhnLab model not found. Run scripts/train_ahnlab.py first. "
                "Predictions will fail until model is available."
            )

    def predict_ranking(self, timeframe: str = "D") -> Dict[str, Any]:
        """
        Predict ranking for ALL symbols.

        Loads latest features for all symbols from etf2_db_processed,
        runs the AhnLab ensemble model, and returns full ranking.

        Args:
            timeframe: Data timeframe (default: D)

        Returns:
            Dict with ranking results:
            - prediction_date: datetime
            - timeframe: str
            - total_symbols: int
            - model_name: str
            - model_version: str
            - rankings: list of {symbol, rank, score, direction, weight, current_close}
        """
        self._ensure_model_loaded()

        model = self.model_loader.get_current_model()
        if model is None:
            raise RuntimeError(
                "No model loaded. Train a model first with scripts/train_ahnlab.py"
            )

        # Load latest features for all symbols
        features_df = self.data_service.get_all_latest_features(timeframe)
        if features_df.empty:
            raise ValueError("No feature data available in etf2_db_processed")

        symbols = features_df["symbol"].tolist()
        logger.info(f"Predicting ranking for {len(symbols)} symbols")

        # Prepare feature matrix
        avail_cols = [c for c in ALL_FEATURE_COLS if c in features_df.columns]
        X = features_df[avail_cols]

        # Predict scores
        scores = model.predict(X)

        # Build ranking
        features_df = features_df.assign(score=scores)
        features_df = features_df.sort_values("score", ascending=False).reset_index(drop=True)
        features_df["rank"] = range(1, len(features_df) + 1)

        # Compute direction and weight based on rank
        n = len(features_df)
        rankings = []
        for _, row in features_df.iterrows():
            rank = int(row["rank"])
            score = float(row["score"])

            # Linear weight: 1st = +1.0 (max buy), last = -1.0 (max sell)
            # Middle = 0.0 (hold)
            if n > 1:
                weight = 1.0 - 2.0 * (rank - 1) / (n - 1)
            else:
                weight = 0.0

            if weight > 0.1:
                direction = "BUY"
            elif weight < -0.1:
                direction = "SELL"
            else:
                direction = "HOLD"

            current_close = float(row["close"]) if "close" in row and pd.notna(row["close"]) else None

            rankings.append({
                "symbol": row["symbol"],
                "rank": rank,
                "score": round(score, 6),
                "direction": direction,
                "weight": round(weight, 4),
                "current_close": round(current_close, 2) if current_close else None,
            })

        metadata = self.model_loader.get_current_metadata()

        result = {
            "prediction_date": datetime.utcnow(),
            "timeframe": timeframe,
            "total_symbols": len(rankings),
            "model_name": "ahnlab_lgbm",
            "model_version": metadata.version if metadata else None,
            "rankings": rankings,
        }

        # Save predictions to local DB
        self._save_ranking_predictions(rankings, timeframe)

        logger.info(
            f"Ranking prediction complete: {len(rankings)} symbols, "
            f"top={rankings[0]['symbol']} score={rankings[0]['score']}"
        )

        return result

    def _save_ranking_predictions(self, rankings: List[Dict], timeframe: str) -> None:
        """Save ranking predictions to local SQLite DB."""
        now = datetime.utcnow()
        next_trading_day = self._get_next_trading_day(now)

        for item in rankings:
            current_close = item["current_close"] or 0.0
            prediction = Prediction(
                symbol=item["symbol"],
                prediction_date=now,
                target_date=next_trading_day,
                current_close=current_close,
                predicted_close=current_close,  # ranking model doesn't predict price
                predicted_direction=item["direction"],
                confidence=abs(item["weight"]),
                rank=item["rank"],
                score=item["score"],
                model_name="ahnlab_lgbm",
            )
            self.local_db.add(prediction)

        try:
            self.local_db.commit()
        except Exception as e:
            logger.error(f"Failed to save ranking predictions: {e}")
            self.local_db.rollback()

    def predict(self, symbol: str, timeframe: str = "D") -> Prediction:
        """
        Predict score for a single symbol (without ranking context).

        Args:
            symbol: Stock ticker symbol
            timeframe: Timeframe

        Returns:
            Prediction ORM object
        """
        self._ensure_model_loaded()

        model = self.model_loader.get_current_model()
        if model is None:
            raise RuntimeError("No model loaded")

        # Get features for this symbol
        features_df = self.data_service.get_features(symbol, timeframe, limit=1)
        if features_df.empty:
            raise ValueError(f"No feature data for {symbol} in etf2_db_processed")

        latest = features_df.iloc[-1]
        avail_cols = [c for c in ALL_FEATURE_COLS if c in features_df.columns]
        X = features_df[avail_cols].iloc[[-1]]

        score = float(model.predict(X)[0])

        current_close = float(latest["close"]) if "close" in latest and pd.notna(latest["close"]) else 0.0
        direction = "BUY" if score > 0 else "SELL" if score < 0 else "HOLD"
        next_trading_day = self._get_next_trading_day(datetime.utcnow())

        prediction = Prediction(
            symbol=symbol,
            prediction_date=datetime.utcnow(),
            target_date=next_trading_day,
            current_close=round(current_close, 2),
            predicted_close=round(current_close, 2),
            predicted_direction=direction,
            confidence=min(abs(score), 1.0),
            score=round(score, 6),
            model_name="ahnlab_lgbm",
        )

        self.local_db.add(prediction)
        self.local_db.commit()
        self.local_db.refresh(prediction)

        return prediction

    def batch_predict(
        self,
        symbols: Optional[List[str]] = None,
        limit: int = 101,
        model_name: Optional[str] = None,
    ) -> List[Prediction]:
        """Batch prediction - delegates to predict_ranking."""
        result = self.predict_ranking()

        # Return saved predictions from the ranking
        return self.get_predictions(limit=limit)

    def _get_next_trading_day(self, date) -> datetime:
        """Calculate next trading day (skip weekends)."""
        if isinstance(date, datetime):
            next_day = date + timedelta(days=1)
        else:
            next_day = pd.Timestamp(date) + timedelta(days=1)

        if next_day.weekday() == 5:  # Saturday
            next_day += timedelta(days=2)
        elif next_day.weekday() == 6:  # Sunday
            next_day += timedelta(days=1)

        return next_day

    def _ensure_regressor_loaded(self) -> bool:
        """Try to load the price regressor model. Returns True if available."""
        try:
            if self.model_loader.get_regressor() is None:
                self.model_loader.load_regressor()
            return True
        except (FileNotFoundError, ImportError):
            return False

    def predict_forecast(
        self,
        symbol: str,
        timeframe: str = "D",
    ) -> Optional[Dict[str, Any]]:
        """
        Predict 63-day future return for a symbol using XGBoost regression model.

        Returns:
            Dict with forecast data, or None if regressor model is not available.
            - symbol: str
            - current_close: float
            - predicted_return: float (target_3m, e.g. 0.15 = +15%)
            - predicted_close: float (current_close * (1 + predicted_return))
            - model_name: str
            - model_version: str
        """
        if not self._ensure_regressor_loaded():
            return None

        regressor = self.model_loader.get_regressor()
        if regressor is None:
            return None

        # Get features for this symbol
        features_df = self.data_service.get_features(symbol, timeframe, limit=1)
        if features_df.empty:
            raise ValueError(f"No feature data for {symbol} in etf2_db_processed")

        latest = features_df.iloc[-1]
        avail_cols = [c for c in ALL_FEATURE_COLS if c in features_df.columns]
        X = features_df[avail_cols].iloc[[-1]]

        predicted_return = float(regressor.predict(X)[0])

        current_close = float(latest["close"]) if "close" in latest and pd.notna(latest["close"]) else 0.0
        predicted_close = current_close * (1.0 + predicted_return)

        metadata = self.model_loader.get_regressor_metadata()

        return {
            "symbol": symbol,
            "current_close": round(current_close, 2),
            "predicted_return": round(predicted_return, 6),
            "predicted_close": round(predicted_close, 2),
            "forecast_days": 63,
            "model_name": "price_regressor",
            "model_version": metadata.version if metadata else None,
        }

    def get_predictions(
        self,
        symbol: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Prediction]:
        """Get stored predictions from database."""
        query = self.local_db.query(Prediction)

        if symbol:
            query = query.filter(Prediction.symbol == symbol)

        return query.order_by(Prediction.created_at.desc()).offset(offset).limit(limit).all()

    def get_prediction_by_id(self, prediction_id: int) -> Optional[Prediction]:
        """Get prediction by ID."""
        return self.local_db.query(Prediction).filter(Prediction.id == prediction_id).first()

    def get_latest_prediction(self, symbol: str) -> Optional[Prediction]:
        """Get latest prediction for a symbol."""
        return (
            self.local_db.query(Prediction)
            .filter(Prediction.symbol == symbol)
            .order_by(Prediction.created_at.desc())
            .first()
        )

    def get_latest_ranking(self) -> List[Prediction]:
        """Get the latest full ranking (all symbols from last prediction run)."""
        # Find the latest prediction_date
        latest = (
            self.local_db.query(Prediction)
            .filter(Prediction.rank.isnot(None))
            .order_by(Prediction.created_at.desc())
            .first()
        )
        if not latest:
            return []

        # Get all predictions from that batch
        return (
            self.local_db.query(Prediction)
            .filter(
                Prediction.prediction_date == latest.prediction_date,
                Prediction.rank.isnot(None),
            )
            .order_by(Prediction.rank.asc())
            .all()
        )

    def get_available_models(self) -> List[ModelMetadata]:
        """Get list of available trained models."""
        return self.model_loader.list_available_models()

    def get_current_model_info(self) -> Optional[ModelMetadata]:
        """Get info about currently loaded model."""
        return self.model_loader.get_current_metadata()

    def load_model(self, model_name: str) -> ModelMetadata:
        """Load a specific model."""
        self.model_loader.load_model(model_name, force_reload=True)
        metadata = self.model_loader.get_current_metadata()
        return metadata
