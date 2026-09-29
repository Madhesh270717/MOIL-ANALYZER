"""
Exploration AI — Retrain Manganese Prospectivity Model (reserve_model_v3)
and conduct the Seismic-Augmented Feature Experiment on the Phase-1 Two-Mine Data.

Models evaluated on the same 80/20 stratified split (random_state=42):
  1. Base Geological Model:
     Features: Fault_Distance_km, Lineament_Density_km_per_km2, Elevation_m,
               Bouguer_Anomaly_mGal, Magnetic_Anomaly_nT
  2. Seismic-Augmented Model (Experiment):
     Features: Base Geological + Vp_m_s, Vs_m_s, Vp_Vs_ratio, Anomaly_Score
               (joined from nearest Geode seismic monitoring station)

Honest evaluation protocol:
  Performs held-out evaluation combined (n=48) and per-mine (Balaghat n=24, Ukwa n=24).
  Only serves the seismic-augmented model if it measurably improves held-out accuracy;
  otherwise serves the simpler base model and discloses the finding.

Saves:
  - backend/reserve_model_v3.pkl (served model)
  - backend/reserve_model_seismic_experiment.pkl (experimental model)

Run:  python backend/train_reserve_model_v3.py
"""

import os
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
GEO_CSV = os.path.join(DATA_DIR, "geological_grid.csv")
SEISMIC_CSV = os.path.join(DATA_DIR, "geological_grid_seismic.csv")

OUT_SERVED_MODEL = os.path.join(SCRIPT_DIR, "reserve_model_v3.pkl")
OUT_EXP_MODEL = os.path.join(SCRIPT_DIR, "reserve_model_seismic_experiment.pkl")

BASE_FEATURES = [
    "Fault_Distance_km",
    "Lineament_Density_km_per_km2",
    "Elevation_m",
    "Bouguer_Anomaly_mGal",
    "Magnetic_Anomaly_nT",
]

SEISMIC_FEATURES = [
    "Vp_m_s",
    "Vs_m_s",
    "Vp_Vs_ratio",
    "Anomaly_Score",
]

AUGMENTED_FEATURES = BASE_FEATURES + SEISMIC_FEATURES
TARGET = "Known_Manganese_Occurrence"

RF_PARAMS = dict(
    n_estimators=300,
    max_depth=8,
    min_samples_leaf=3,
    class_weight="balanced",
    random_state=42,
)


def compute_metrics(y_true, y_pred, y_prob):
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, y_prob)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
    }


def evaluate_model(model, X_test, y_test, df_test, label):
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    comb = compute_metrics(y_test, y_pred, y_prob)

    per_mine = {}
    for mine in ["balaghat", "ukwa"]:
        mask = df_test["Mine_ID"] == mine
        sub_yt = y_test[mask]
        sub_yp = y_pred[mask]
        sub_ypr = y_prob[mask]
        per_mine[mine] = {
            "n": int(len(sub_yt)),
            "metrics": compute_metrics(sub_yt, sub_yp, sub_ypr),
        }

    print("=" * 65)
    print(f"{label.upper()}")
    print("=" * 65)
    print(f"Combined Test Samples: {len(y_test)}")
    print(
        f"  Accuracy:  {comb['accuracy']:.4f}  |  ROC-AUC: {comb['roc_auc']:.4f}  |  "
        f"F1: {comb['f1']:.4f}  |  Prec: {comb['precision']:.4f}  |  Rec: {comb['recall']:.4f}"
    )
    print("Per-Mine Test Evaluation:")
    for mine, res in per_mine.items():
        m = res["metrics"]
        print(
            f"  {mine.title():8s} (n={res['n']}): Accuracy={m['accuracy']:.4f}  "
            f"ROC-AUC={m['roc_auc']:.4f}  F1={m['f1']:.4f}  Prec={m['precision']:.4f}  Rec={m['recall']:.4f}"
        )

    return y_pred, y_prob, comb, per_mine


def main():
    if not os.path.exists(SEISMIC_CSV):
        raise FileNotFoundError(f"Missing {SEISMIC_CSV}. Run generate_two_mine_datasets.py first.")

    df = pd.read_csv(SEISMIC_CSV)
    print(f"Loaded {len(df)} rows from {SEISMIC_CSV}")
    print(f"Class distribution:\n{df[TARGET].value_counts().to_string()}\n")

    # Shared 80/20 stratified split on Known_Manganese_Occurrence
    train_idx, test_idx = train_test_split(
        df.index,
        test_size=0.2,
        random_state=42,
        stratify=df[TARGET],
    )
    train_df = df.loc[train_idx]
    test_df = df.loc[test_idx]

    y_train = train_df[TARGET]
    y_test = test_df[TARGET]

    # --- 1. Train Base Geological Model ---
    m1 = RandomForestClassifier(**RF_PARAMS)
    m1.fit(train_df[BASE_FEATURES], y_train)
    _, _, comb1, per_mine1 = evaluate_model(
        m1, test_df[BASE_FEATURES], y_test, test_df, "1. Base Geological Prospectivity Model"
    )

    # --- 2. Train Seismic-Augmented Model (Experiment) ---
    m2 = RandomForestClassifier(**RF_PARAMS)
    m2.fit(train_df[AUGMENTED_FEATURES], y_train)
    _, _, comb2, per_mine2 = evaluate_model(
        m2, test_df[AUGMENTED_FEATURES], y_test, test_df, "2. Seismic-Augmented Prospectivity Model (Experiment)"
    )

    # --- Side-by-side comparison ---
    print("\n" + "#" * 65)
    print("SIDE-BY-SIDE EVALUATION COMPARISON (Held-Out 80/20 Split)")
    print("#" * 65)
    print(
        f"  Base Model:    Accuracy = {comb1['accuracy']:.4f} | ROC-AUC = {comb1['roc_auc']:.4f} | F1 = {comb1['f1']:.4f}"
    )
    print(
        f"  Seismic Model: Accuracy = {comb2['accuracy']:.4f} | ROC-AUC = {comb2['roc_auc']:.4f} | F1 = {comb2['f1']:.4f}"
    )

    # Decision rule: Only keep seismic version as served model if it measurably improves accuracy
    diff = comb2["accuracy"] - comb1["accuracy"]
    if diff > 0.005:
        served_model = m2
        served_features = AUGMENTED_FEATURES
        decision_note = (
            f"Seismic-augmented model selected for serving (accuracy +{diff:.4f} improvement over base model)."
        )
    else:
        served_model = m1
        served_features = BASE_FEATURES
        decision_note = (
            f"Base model selected for serving (seismic augmentation showed no measurable accuracy improvement: "
            f"{comb2['accuracy']:.4f} vs {comb1['accuracy']:.4f}). Simpler model served per honest protocol."
        )

    print(f"\nDecision: {decision_note}")

    # Persist served model artifact
    joblib.dump({"model": served_model, "features": served_features}, OUT_SERVED_MODEL)
    print(f"Saved served model: {OUT_SERVED_MODEL}")

    # Persist base experiment model artifact for side-by-side comparison
    joblib.dump({"model": m1, "features": BASE_FEATURES}, OUT_EXP_MODEL)
    print(f"Saved base experimental model: {OUT_EXP_MODEL}")

    # Feature importances for both
    imp1 = pd.Series(m1.feature_importances_, index=BASE_FEATURES).sort_values(ascending=False)
    print("\nFeature importances (Base Model):")
    print(imp1.to_string())

    imp2 = pd.Series(m2.feature_importances_, index=AUGMENTED_FEATURES).sort_values(ascending=False)
    print("\nFeature importances (Seismic Model):")
    print(imp2.to_string())


if __name__ == "__main__":
    main()
