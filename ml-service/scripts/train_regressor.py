#!/usr/bin/env python3
"""
Train XGBoost regression model for 63-day price prediction.

Reads features from etf2_db_processed, trains a 2-fold rolling CV
XGBoost ensemble, and saves model files to ml-service/data/models/price_regressor/.

Target: target_3m (63-day forward return)
Features: Same 85 columns as ranking model
Output: Predicted future return per symbol

Usage:
    python scripts/train_regressor.py
    python scripts/train_regressor.py --pred-year 2025
    python scripts/train_regressor.py --device gpu
"""
import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    import xgboost as xgb
except ImportError:
    logger.error("xgboost is required. Install with: pip install xgboost")
    sys.exit(1)

# ── Feature columns (same 85 as ranking model) ──

BASE_FEATURE_COLS = [
    "open", "high", "low", "close", "volume", "dividends", "stock_splits",
    "ret_1d", "ret_5d", "ret_20d", "ret_63d",
    "macd", "macd_signal", "macd_hist",
    "rsi_14", "rsi_28",
    "bb_upper", "bb_middle", "bb_lower", "bb_width", "bb_position",
    "atr_14", "obv",
    "ema_10", "ema_20", "ema_50", "ema_200",
    "sma_10", "sma_20", "sma_50",
    "stoch_k", "stoch_d", "adx", "cci", "willr", "mfi", "vwap",
    "volume_sma_20", "volume_ratio",
    "vix", "fed_funds_rate", "unemployment_rate", "cpi",
    "treasury_10y", "treasury_2y", "yield_curve",
    "oil_price", "usd_eur", "high_yield_spread",
]

ENGINEERED_FEATURE_COLS = [
    "ret_10d", "ret_30d", "vol_20d", "vol_63d",
    "price_to_sma_50", "price_to_ema_200", "volume_trend",
    "close_to_high_52w", "ret_5d_20d_ratio", "momentum_strength",
    "volume_surge", "ret_vol_ratio_20d", "ret_vol_ratio_63d",
    "trend_acceleration", "close_to_high_20d", "close_to_high_63d",
    "close_to_high_126d",
    "ema_5", "ema_100", "price_to_ema_10", "price_to_ema_50",
    "ema_cross_short", "ema_cross_long", "ema_slope_20",
]

ZS_BASE_COLS = [
    "vol_63d", "volume_sma_20", "obv", "vwap",
    "ema_200", "price_to_ema_200", "close_to_high_52w",
]
ZS_FEATURE_COLS = [f"{col}_zs" for col in ZS_BASE_COLS]

RANK_BASE_COLS = [
    "ret_20d", "ret_63d", "vol_20d", "momentum_strength", "volume_surge",
]
RANK_FEATURE_COLS = [f"{col}_rank" for col in RANK_BASE_COLS]

ALL_FEATURE_COLS = BASE_FEATURE_COLS + ENGINEERED_FEATURE_COLS + ZS_FEATURE_COLS + RANK_FEATURE_COLS

# ── XGBoost hyperparameters ──

XGB_PARAMS = {
    "objective": "reg:squarederror",
    "eval_metric": "rmse",
    "max_depth": 8,
    "learning_rate": 0.01,
    "subsample": 0.8,
    "colsample_bytree": 0.7,
    "reg_alpha": 0.5,
    "reg_lambda": 1.0,
    "min_child_weight": 5,
    "verbosity": 1,
}

NUM_BOOST_ROUND = 3000
EARLY_STOPPING_ROUNDS = 100
SEED = 42
MIN_HISTORY_DAYS = 126


def get_db_url() -> str:
    """Build processed DB URL."""
    url = os.getenv("PROCESSED_DB_URL")
    if url:
        return url
    host = os.getenv("MYSQL_HOST", "host.docker.internal")
    port = os.getenv("MYSQL_PORT", "3306")
    user = os.getenv("MYSQL_USER", "ahnbi2")
    password = os.getenv("MYSQL_PASSWORD", "bigdata")
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/etf2_db_processed"


def load_panel_from_db(engine) -> pd.DataFrame:
    """Load all symbol data from etf2_db_processed into a panel DataFrame."""
    with engine.connect() as conn:
        result = conn.execute(
            text(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                "WHERE TABLE_SCHEMA = 'etf2_db_processed' "
                "AND TABLE_NAME LIKE '%_D'"
            )
        )
        tables = [row[0] for row in result]

    logger.info(f"Found {len(tables)} daily tables")

    cols_str = ", ".join(f"`{c}`" for c in ALL_FEATURE_COLS)
    all_dfs = []

    for table_name in tables:
        symbol = table_name.replace("_D", "")
        try:
            query = text(
                f"SELECT `time`, `target_3m`, {cols_str} "
                f"FROM `{table_name}` ORDER BY `time`"
            )
            df = pd.read_sql(query, engine)
            if df.empty:
                continue
            df["ticker"] = symbol
            df.rename(columns={"time": "date"}, inplace=True)
            df["date"] = pd.to_datetime(df["date"])
            all_dfs.append(df)
        except Exception as e:
            logger.warning(f"Failed to load {table_name}: {e}")
            continue

    if not all_dfs:
        raise RuntimeError("No data loaded from processed DB")

    panel = pd.concat(all_dfs, ignore_index=True)
    logger.info(f"Panel loaded: {len(panel)} rows, {panel['ticker'].nunique()} symbols")
    return panel


def get_rolling_folds(pred_year: int):
    """Get rolling 2-fold CV configuration (same as ranking model)."""
    valid_year_1 = pred_year - 3
    valid_year_2 = pred_year - 1
    return [
        {
            "train_end": pd.Timestamp(f"{valid_year_1 - 1}-12-31"),
            "valid_start": pd.Timestamp(f"{valid_year_1}-01-01"),
            "valid_end": pd.Timestamp(f"{valid_year_1}-12-31"),
        },
        {
            "train_end": pd.Timestamp(f"{valid_year_2 - 1}-12-31"),
            "valid_start": pd.Timestamp(f"{valid_year_2}-01-01"),
            "valid_end": pd.Timestamp(f"{valid_year_2}-12-31"),
        },
    ]


def prepare_window(panel, start, end, feature_cols):
    """Prepare a data window for regression training."""
    mask = (panel["date"] >= start) & (panel["date"] <= end)
    df = panel.loc[mask].copy()

    if df.empty:
        return df

    avail_cols = [c for c in feature_cols if c in df.columns]
    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    df.dropna(subset=["target_3m"], inplace=True)
    df[avail_cols] = df[avail_cols].fillna(0)

    return df


def train_single_regressor(train_df, valid_df, feature_cols, params, device="cpu"):
    """Train a single XGBoost regression model."""
    avail_cols = [c for c in feature_cols if c in train_df.columns]

    X_train = train_df[avail_cols].values
    y_train = train_df["target_3m"].values

    X_valid = valid_df[avail_cols].values
    y_valid = valid_df["target_3m"].values

    dtrain = xgb.DMatrix(X_train, label=y_train, feature_names=avail_cols)
    dvalid = xgb.DMatrix(X_valid, label=y_valid, feature_names=avail_cols)

    full_params = {**params, "seed": SEED}
    if device == "gpu" or device == "cuda":
        full_params["tree_method"] = "gpu_hist"
        full_params["device"] = "cuda"
    else:
        full_params["tree_method"] = "hist"

    evals_result = {}
    model = xgb.train(
        full_params,
        dtrain,
        num_boost_round=NUM_BOOST_ROUND,
        evals=[(dtrain, "train"), (dvalid, "valid")],
        early_stopping_rounds=EARLY_STOPPING_ROUNDS,
        verbose_eval=100,
        evals_result=evals_result,
    )

    return model, evals_result


def main():
    parser = argparse.ArgumentParser(description="Train XGBoost regression model for price prediction")
    parser.add_argument("--pred-year", type=int, default=datetime.now().year,
                        help="Prediction year (default: current year)")
    parser.add_argument("--device", choices=["cpu", "gpu", "auto"], default="cpu",
                        help="Compute device")
    parser.add_argument("--train-start", default="2010-01-01",
                        help="Training data start date")
    parser.add_argument("--output-dir", default=None,
                        help="Output directory (default: ml-service/data/models/price_regressor/)")
    args = parser.parse_args()

    pred_year = args.pred_year
    device = args.device
    if device == "auto":
        try:
            import subprocess
            result = subprocess.run(["nvidia-smi"], capture_output=True, timeout=5)
            device = "gpu" if result.returncode == 0 else "cpu"
        except Exception:
            device = "cpu"

    logger.info(f"Training XGBoost regressor for pred_year={pred_year}, device={device}")

    # Output directory
    if args.output_dir:
        output_base = Path(args.output_dir)
    else:
        output_base = Path(__file__).parent.parent / "data" / "models" / "price_regressor"

    version_name = f"v{datetime.now().strftime('%Y%m%d')}"
    version_dir = output_base / version_name
    version_dir.mkdir(parents=True, exist_ok=True)

    # Load data
    db_url = get_db_url()
    logger.info(f"Connecting to: {db_url.split('@')[0]}@...")
    engine = create_engine(db_url, pool_pre_ping=True)

    panel = load_panel_from_db(engine)

    # Shift features by 1 day to prevent leakage
    logger.info("Shifting features by 1 day...")
    grouped = panel.groupby("ticker")
    for col in ALL_FEATURE_COLS:
        if col in panel.columns:
            panel[col] = grouped[col].shift(1)

    # Train rolling 2-fold CV
    folds = get_rolling_folds(pred_year)
    train_start = pd.Timestamp(args.train_start)

    models = []
    for idx, fold in enumerate(folds, start=1):
        logger.info(
            f"Fold {idx}: valid {fold['valid_start'].date()} ~ {fold['valid_end'].date()}"
        )

        train_df = prepare_window(
            panel, train_start, fold["train_end"], ALL_FEATURE_COLS
        )
        valid_df = prepare_window(
            panel, fold["valid_start"], fold["valid_end"], ALL_FEATURE_COLS
        )

        if train_df.empty or valid_df.empty:
            logger.warning(f"Skipping fold {idx}: insufficient data")
            continue

        logger.info(f"Fold {idx}: {len(train_df)} train rows, {len(valid_df)} valid rows")

        model, evals_result = train_single_regressor(
            train_df, valid_df, ALL_FEATURE_COLS, XGB_PARAMS, device
        )
        models.append(model)

        best_iter = model.best_iteration
        best_rmse = evals_result["valid"]["rmse"][best_iter]
        logger.info(f"Fold {idx} done, best_iteration={best_iter}, valid_rmse={best_rmse:.6f}")

    if not models:
        logger.error("No models trained!")
        sys.exit(1)

    # Save fold files as JSON
    for i, model in enumerate(models):
        fold_path = version_dir / f"price_regressor_fold{i}.json"
        model.save_model(str(fold_path))
        logger.info(f"Saved: {fold_path}")

    # Save metadata
    metadata = {
        "version": version_name,
        "trained_at": datetime.now().isoformat(),
        "pred_year": pred_year,
        "n_symbols": panel["ticker"].nunique(),
        "n_features": len(ALL_FEATURE_COLS),
        "n_folds": len(models),
        "n_train_rows": len(panel),
        "target": "target_3m",
        "target_description": "63-day forward return",
        "xgb_params": XGB_PARAMS,
        "device": device,
        "format": "json",
        "model_type": "xgboost_regressor",
    }
    with open(version_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2, default=str)

    # Update current symlink
    current_link = output_base / "current"
    if current_link.is_symlink():
        current_link.unlink()
    elif current_link.exists():
        import shutil
        shutil.rmtree(current_link)
    current_link.symlink_to(version_name)
    logger.info(f"Updated current -> {version_name}")

    # Update versions.json
    versions_file = output_base / "versions.json"
    if versions_file.exists():
        with open(versions_file) as f:
            versions_data = json.load(f)
    else:
        versions_data = {"current": None, "versions": []}

    for v in versions_data["versions"]:
        if v.get("status") == "active":
            v["status"] = "archived"

    versions_data["current"] = version_name
    versions_data["versions"].insert(0, {
        "version": version_name,
        "trained_at": datetime.now().isoformat(),
        "status": "active",
    })

    with open(versions_file, "w") as f:
        json.dump(versions_data, f, indent=2)

    logger.info(f"Training complete! Model saved to {version_dir}")
    logger.info(f"  Folds: {len(models)}")
    logger.info(f"  Symbols: {panel['ticker'].nunique()}")
    logger.info(f"  Features: {len(ALL_FEATURE_COLS)}")
    logger.info(f"  Target: target_3m (63-day forward return)")


if __name__ == "__main__":
    main()
