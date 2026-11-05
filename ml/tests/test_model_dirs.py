from meetops_ml import data


def test_newest_model_and_fallback_without_transformers(tmp_path, monkeypatch):
    (tmp_path / "v3").mkdir()
    (tmp_path / "v3" / data.MODEL_FILENAME).write_text("x")
    (tmp_path / "v6" / data.TRANSFORMER_DIR).mkdir(parents=True)
    (tmp_path / "v6" / data.TRANSFORMER_DIR / "config.json").write_text("{}")
    (tmp_path / "v7").mkdir()                       # empty folder: not a model
    monkeypatch.setattr(data, "MODELS_ROOT", tmp_path)
    assert data.latest_model_dir().name == "v6"
    assert data.latest_model_dir(transformers=False).name == "v3"


def test_rejected_model_is_skipped(tmp_path, monkeypatch):
    for v in ("v6", "v7"):
        (tmp_path / v / data.TRANSFORMER_DIR).mkdir(parents=True)
        (tmp_path / v / data.TRANSFORMER_DIR / "config.json").write_text("{}")
    monkeypatch.setattr(data, "MODELS_ROOT", tmp_path)
    assert data.latest_model_dir().name == "v7"
    (tmp_path / "v7" / "REJECTED").write_text("worse on test_v1v2")
    assert data.latest_model_dir().name == "v6"
