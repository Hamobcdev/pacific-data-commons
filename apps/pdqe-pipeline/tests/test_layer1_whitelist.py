from app.security.layer1_whitelist import check_layer1, validate_file_type

ALLOWED = ["pdf", "csv", "json", "xlsx", "docx", "txt", "xml"]


def test_accepts_all_whitelisted_types() -> None:
    for ext in ALLOWED:
        assert validate_file_type(ext) is True


def test_rejects_disallowed_type() -> None:
    assert validate_file_type("exe") is False


def test_whitelist_check_is_case_insensitive() -> None:
    assert validate_file_type("PDF") is True


def test_check_layer1_records_rejection_reason() -> None:
    result = check_layer1("malware.exe", "exe")
    assert result.passed is False
    assert result.rejection_reason is not None
    assert "exe" in result.rejection_reason


def test_check_layer1_passes_whitelisted() -> None:
    result = check_layer1("bulletin.pdf", "pdf")
    assert result.passed is True
    assert result.rejection_reason is None
