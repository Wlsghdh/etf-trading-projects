"""
Model Loader Service - Load trained models from disk and manage model lifecycle.

Supports:
1. AhnLab LightGBM Booster files ({path}_fold{i}.txt) with version management
2. Legacy pickle/joblib model files

Usage:
    loader = ModelLoader()
    loader.load_model("ahnlab_lgbm")
    predictions = loader.predict(features)
"""
import json
import logging
import os
import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

try:
    import lightgbm as lgb
    HAS_LIGHTGBM = True
except ImportError:
    HAS_LIGHTGBM = False

try:
    import xgboost as xgb
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

try:
    import joblib
    HAS_JOBLIB = True
except ImportError:
    HAS_JOBLIB = False


from dataclasses import dataclass, field


@dataclass
class ModelMetadata:
    """Metadata for a loaded model"""
    name: str
    version: str = "1.0.0"
    description: str = ""
    model_type: str = "unknown"
    trained_at: Optional[str] = None
    training_years: List[int] = field(default_factory=list)
    feature_count: int = 0
    params: Dict[str, Any] = field(default_factory=dict)
    file_path: Optional[str] = None


class _BoosterWrapper:
    """Wrapper to make lgb.Booster behave like LGBMRanker for prediction."""

    def __init__(self, booster: "lgb.Booster"):
        self.booster_ = booster
        self.best_iteration_ = None

    def predict(self, X: pd.DataFrame, num_iteration: Optional[int] = None) -> np.ndarray:
        return self.booster_.predict(X, num_iteration=num_iteration)


class AhnLabEnsemble:
    """Ensemble of LightGBM Booster models for ranking prediction."""

    def __init__(self, models: List[_BoosterWrapper]):
        self.models = models

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Predict using ensemble averaging across all fold models."""
        X_clean = X.replace([np.inf, -np.inf], np.nan).fillna(0)
        preds = np.zeros(len(X_clean), dtype=float)
        for model in self.models:
            num_iter = model.best_iteration_
            preds += model.predict(X_clean, num_iteration=num_iter)
        preds /= len(self.models)
        return preds


class XGBRegressorEnsemble:
    """Ensemble of XGBoost Booster models for regression prediction."""

    def __init__(self, boosters: List["xgb.Booster"]):
        self.boosters = boosters

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Predict using ensemble averaging across all fold models."""
        X_clean = X.replace([np.inf, -np.inf], np.nan).fillna(0)
        feature_names = list(X_clean.columns) if hasattr(X_clean, 'columns') else None
        dmatrix = xgb.DMatrix(X_clean, feature_names=feature_names)
        preds = np.zeros(len(X_clean), dtype=float)
        for booster in self.boosters:
            preds += booster.predict(dmatrix)
        preds /= len(self.boosters)
        return preds


class ModelLoader:
    """
    Load and manage trained ML models.

    Supports:
    - AhnLab LightGBM: data/models/ahnlab_lgbm/current/ (symlink to version dir)
    - Price Regressor XGBoost: data/models/price_regressor/current/ (symlink to version dir)
    - Legacy: data/models/{name}.pkl or .joblib
    """

    def __init__(self, models_dir: Optional[str] = None):
        if models_dir is None:
            self.models_dir = Path(__file__).parent.parent.parent / "data" / "models"
        else:
            self.models_dir = Path(models_dir)

        self.models_dir.mkdir(parents=True, exist_ok=True)

        self._current_model: Optional[Any] = None
        self._current_metadata: Optional[ModelMetadata] = None

        # Separate slot for regression model (can coexist with ranking model)
        self._regressor_model: Optional[XGBRegressorEnsemble] = None
        self._regressor_metadata: Optional[ModelMetadata] = None

        logger.info(f"ModelLoader initialized with models directory: {self.models_dir}")

    def list_available_models(self) -> List[ModelMetadata]:
        """List all available trained models."""
        models = []

        # Check for AhnLab LightGBM model
        ahnlab_dir = self.models_dir / "ahnlab_lgbm"
        if ahnlab_dir.is_dir():
            metadata = self._load_ahnlab_metadata(ahnlab_dir)
            if metadata:
                models.append(metadata)

        # Check for Price Regressor XGBoost model
        regressor_dir = self.models_dir / "price_regressor"
        if regressor_dir.is_dir():
            metadata = self._load_regressor_metadata(regressor_dir)
            if metadata:
                models.append(metadata)

        # Check for .pkl and .joblib files
        for ext in ["*.pkl", "*.joblib"]:
            for model_path in self.models_dir.glob(ext):
                name = model_path.stem
                metadata = self._extract_metadata(name, model_path)
                models.append(metadata)

        # Check for subdirectories with model.pkl (exclude known model dirs)
        for model_dir in self.models_dir.iterdir():
            if model_dir.is_dir() and model_dir.name not in ("ahnlab_lgbm", "price_regressor"):
                model_file = model_dir / "model.pkl"
                if model_file.exists():
                    metadata = self._extract_metadata(model_dir.name, model_file)
                    models.append(metadata)

        return sorted(models, key=lambda m: m.name)

    def _load_ahnlab_metadata(self, ahnlab_dir: Path) -> Optional[ModelMetadata]:
        """Load metadata for AhnLab LightGBM model."""
        # Resolve current version (symlink or direct)
        current_dir = ahnlab_dir / "current"
        if current_dir.is_symlink() or current_dir.is_dir():
            resolved = current_dir.resolve()
        else:
            # No current symlink - try to find any version directory
            version_dirs = sorted(
                [d for d in ahnlab_dir.iterdir() if d.is_dir() and d.name.startswith("v")],
                reverse=True,
            )
            if version_dirs:
                resolved = version_dirs[0]
            else:
                # Check for fold files directly in the directory
                fold_files = list(ahnlab_dir.glob("*_fold*.txt"))
                if fold_files:
                    resolved = ahnlab_dir
                else:
                    return None

        # Check fold files exist
        fold_files = list(resolved.glob("*_fold*.txt"))
        if not fold_files:
            return None

        # Read metadata.json if available
        metadata_file = resolved / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file) as f:
                meta = json.load(f)
            return ModelMetadata(
                name="ahnlab_lgbm",
                version=meta.get("version", "unknown"),
                description="AhnLab LightGBM LambdaRank Ranking Model",
                model_type="lightgbm",
                trained_at=meta.get("trained_at"),
                feature_count=meta.get("n_features", 85),
                params=meta.get("lgb_params", {}),
                file_path=str(resolved),
            )

        return ModelMetadata(
            name="ahnlab_lgbm",
            description="AhnLab LightGBM LambdaRank Ranking Model",
            model_type="lightgbm",
            feature_count=85,
            file_path=str(resolved),
        )

    def _extract_metadata(self, name: str, path: Path) -> ModelMetadata:
        """Extract metadata from model file name/path."""
        model_type = "unknown"
        if "lgb" in name.lower() or "lightgbm" in name.lower():
            model_type = "lightgbm"
        elif "xgb" in name.lower() or "xgboost" in name.lower():
            model_type = "xgboost"
        elif "catboost" in name.lower():
            model_type = "catboost"
        elif "tabpfn" in name.lower():
            model_type = "tabpfn"
        elif "ridge" in name.lower():
            model_type = "ridge"

        import re
        year_match = re.findall(r'20\d{2}', name)
        years = [int(y) for y in year_match] if year_match else []

        return ModelMetadata(
            name=name,
            model_type=model_type,
            file_path=str(path),
            training_years=years,
        )

    def load_model(
        self,
        model_name: str,
        model_factory=None,
        force_reload: bool = False,
    ) -> Any:
        """Load a trained model from disk."""
        # Check if already loaded
        if not force_reload and self._current_model is not None:
            if self._current_metadata and self._current_metadata.name == model_name:
                logger.info(f"Model {model_name} already loaded, using cached")
                return self._current_model

        logger.info(f"Loading model: {model_name}")

        # AhnLab LightGBM special handling
        if model_name == "ahnlab_lgbm":
            return self._load_ahnlab_model()

        # Price Regressor XGBoost special handling
        if model_name == "price_regressor":
            return self._load_regressor_model()

        # Legacy model loading
        model_path = self._find_model_path(model_name)

        if model_path is None:
            if model_factory:
                logger.info(f"No saved model found, creating via factory: {model_name}")
                model = model_factory(model_name)
                self._current_model = model
                self._current_metadata = ModelMetadata(name=model_name)
                return model
            raise FileNotFoundError(
                f"Model {model_name} not found in {self.models_dir}. "
                f"Available models: {[m.name for m in self.list_available_models()]}"
            )

        try:
            if model_path.suffix == ".pkl":
                with open(model_path, "rb") as f:
                    model_data = pickle.load(f)
            elif model_path.suffix == ".joblib":
                if HAS_JOBLIB:
                    model_data = joblib.load(model_path)
                else:
                    with open(model_path, "rb") as f:
                        model_data = pickle.load(f)
            else:
                raise ValueError(f"Unsupported model format: {model_path.suffix}")

            if isinstance(model_data, dict) and "model" in model_data:
                model = model_data["model"]
                metadata = model_data.get("metadata", {})
            else:
                model = model_data
                metadata = {}

            self._current_metadata = ModelMetadata(
                name=model_name,
                model_type=metadata.get("model_type", "unknown"),
                trained_at=metadata.get("trained_at"),
                feature_count=metadata.get("feature_count", 0),
                params=metadata.get("params", {}),
                file_path=str(model_path),
            )
            self._current_model = model
            logger.info(f"Model loaded: {model_name} from {model_path}")
            return model

        except Exception as e:
            logger.error(f"Failed to load model {model_name}: {e}")
            raise

    def _load_ahnlab_model(self) -> AhnLabEnsemble:
        """Load AhnLab LightGBM ensemble from fold .txt files."""
        if not HAS_LIGHTGBM:
            raise ImportError("lightgbm is required for AhnLab model. Install with: pip install lightgbm")

        ahnlab_dir = self.models_dir / "ahnlab_lgbm"

        # Resolve current version
        current_dir = ahnlab_dir / "current"
        if current_dir.is_symlink() or current_dir.is_dir():
            model_dir = current_dir.resolve()
        else:
            # Fallback: find latest version dir or use ahnlab_dir directly
            version_dirs = sorted(
                [d for d in ahnlab_dir.iterdir() if d.is_dir() and d.name.startswith("v")],
                reverse=True,
            )
            if version_dirs:
                model_dir = version_dirs[0]
            else:
                model_dir = ahnlab_dir

        # Find fold files
        fold_files = sorted(model_dir.glob("*_fold*.txt"))
        if not fold_files:
            raise FileNotFoundError(
                f"No fold .txt files found in {model_dir}. "
                f"Expected files like ahnlab_lgbm_fold0.txt, ahnlab_lgbm_fold1.txt"
            )

        models = []
        for fold_path in fold_files:
            booster = lgb.Booster(model_file=str(fold_path))
            models.append(_BoosterWrapper(booster))
            logger.info(f"Loaded booster from {fold_path}")

        ensemble = AhnLabEnsemble(models)

        # Load metadata
        metadata_file = model_dir / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file) as f:
                meta = json.load(f)
            self._current_metadata = ModelMetadata(
                name="ahnlab_lgbm",
                version=meta.get("version", "unknown"),
                description="AhnLab LightGBM LambdaRank Ranking Model",
                model_type="lightgbm",
                trained_at=meta.get("trained_at"),
                feature_count=meta.get("n_features", 85),
                params=meta.get("lgb_params", {}),
                file_path=str(model_dir),
            )
        else:
            self._current_metadata = ModelMetadata(
                name="ahnlab_lgbm",
                description="AhnLab LightGBM LambdaRank Ranking Model",
                model_type="lightgbm",
                feature_count=85,
                file_path=str(model_dir),
            )

        self._current_model = ensemble
        logger.info(f"AhnLab ensemble loaded: {len(models)} fold models from {model_dir}")
        return ensemble

    def _load_regressor_metadata(self, regressor_dir: Path) -> Optional[ModelMetadata]:
        """Load metadata for Price Regressor XGBoost model."""
        current_dir = regressor_dir / "current"
        if current_dir.is_symlink() or current_dir.is_dir():
            resolved = current_dir.resolve()
        else:
            version_dirs = sorted(
                [d for d in regressor_dir.iterdir() if d.is_dir() and d.name.startswith("v")],
                reverse=True,
            )
            if version_dirs:
                resolved = version_dirs[0]
            else:
                fold_files = list(regressor_dir.glob("*_fold*.json"))
                if fold_files:
                    resolved = regressor_dir
                else:
                    return None

        fold_files = list(resolved.glob("*_fold*.json"))
        if not fold_files:
            return None

        metadata_file = resolved / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file) as f:
                meta = json.load(f)
            return ModelMetadata(
                name="price_regressor",
                version=meta.get("version", "unknown"),
                description="XGBoost Regression Model (63-day price prediction)",
                model_type="xgboost",
                trained_at=meta.get("trained_at"),
                feature_count=meta.get("n_features", 85),
                params=meta.get("xgb_params", {}),
                file_path=str(resolved),
            )

        return ModelMetadata(
            name="price_regressor",
            description="XGBoost Regression Model (63-day price prediction)",
            model_type="xgboost",
            feature_count=85,
            file_path=str(resolved),
        )

    def _load_regressor_model(self) -> XGBRegressorEnsemble:
        """Load Price Regressor XGBoost ensemble from fold .json files."""
        if not HAS_XGBOOST:
            raise ImportError("xgboost is required for price regressor. Install with: pip install xgboost")

        regressor_dir = self.models_dir / "price_regressor"

        current_dir = regressor_dir / "current"
        if current_dir.is_symlink() or current_dir.is_dir():
            model_dir = current_dir.resolve()
        else:
            version_dirs = sorted(
                [d for d in regressor_dir.iterdir() if d.is_dir() and d.name.startswith("v")],
                reverse=True,
            )
            if version_dirs:
                model_dir = version_dirs[0]
            else:
                model_dir = regressor_dir

        fold_files = sorted(model_dir.glob("*_fold*.json"))
        if not fold_files:
            raise FileNotFoundError(
                f"No fold .json files found in {model_dir}. "
                f"Expected files like price_regressor_fold0.json, price_regressor_fold1.json. "
                f"Run scripts/train_regressor.py to train the model."
            )

        boosters = []
        for fold_path in fold_files:
            booster = xgb.Booster(model_file=str(fold_path))
            boosters.append(booster)
            logger.info(f"Loaded XGBoost booster from {fold_path}")

        ensemble = XGBRegressorEnsemble(boosters)

        metadata_file = model_dir / "metadata.json"
        if metadata_file.exists():
            with open(metadata_file) as f:
                meta = json.load(f)
            self._regressor_metadata = ModelMetadata(
                name="price_regressor",
                version=meta.get("version", "unknown"),
                description="XGBoost Regression Model (63-day price prediction)",
                model_type="xgboost",
                trained_at=meta.get("trained_at"),
                feature_count=meta.get("n_features", 85),
                params=meta.get("xgb_params", {}),
                file_path=str(model_dir),
            )
        else:
            self._regressor_metadata = ModelMetadata(
                name="price_regressor",
                description="XGBoost Regression Model (63-day price prediction)",
                model_type="xgboost",
                feature_count=85,
                file_path=str(model_dir),
            )

        self._regressor_model = ensemble
        logger.info(f"Price regressor ensemble loaded: {len(boosters)} fold models from {model_dir}")
        return ensemble

    def get_regressor(self) -> Optional[XGBRegressorEnsemble]:
        """Get loaded regression model (separate from ranking model)."""
        return self._regressor_model

    def get_regressor_metadata(self) -> Optional[ModelMetadata]:
        """Get metadata of loaded regression model."""
        return self._regressor_metadata

    def load_regressor(self) -> XGBRegressorEnsemble:
        """Load the price regressor model (separate from load_model for ranking)."""
        if self._regressor_model is not None:
            logger.info("Price regressor already loaded, using cached")
            return self._regressor_model
        return self._load_regressor_model()

    def _find_model_path(self, model_name: str) -> Optional[Path]:
        """Find the model file for a given model name."""
        for ext in [".pkl", ".joblib"]:
            path = self.models_dir / f"{model_name}{ext}"
            if path.exists():
                return path

        dir_path = self.models_dir / model_name
        model_file = dir_path / "model.pkl"
        if model_file.exists():
            return model_file

        return None

    def get_current_model(self) -> Optional[Any]:
        """Get currently loaded model."""
        return self._current_model

    def get_current_metadata(self) -> Optional[ModelMetadata]:
        """Get metadata of currently loaded model."""
        return self._current_metadata

    def predict(self, features: Any) -> Any:
        """Make predictions with the currently loaded model."""
        if self._current_model is None:
            raise RuntimeError(
                "No model loaded. Call load_model() first. "
                f"Available models: {[m.name for m in self.list_available_models()]}"
            )

        if hasattr(self._current_model, 'predict'):
            return self._current_model.predict(features)
        elif callable(self._current_model):
            return self._current_model(features)
        else:
            raise RuntimeError(f"Model {type(self._current_model)} has no predict() method")

    def save_model(
        self,
        model: Any,
        model_name: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Path:
        """Save a trained model to disk."""
        model_path = self.models_dir / f"{model_name}.pkl"

        save_data = {"model": model}
        if metadata:
            save_data["metadata"] = metadata

        with open(model_path, "wb") as f:
            pickle.dump(save_data, f)

        logger.info(f"Model saved: {model_path}")
        return model_path

    def is_model_loaded(self) -> bool:
        """Check if a model is currently loaded."""
        return self._current_model is not None


# Global singleton instance
_global_loader: Optional[ModelLoader] = None


def get_model_loader() -> ModelLoader:
    """Get global ModelLoader singleton."""
    global _global_loader
    if _global_loader is None:
        _global_loader = ModelLoader()
    return _global_loader
