from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def normalize_asyncpg_url(raw_url: str) -> str:
    """
    Normalize Postgres URLs for SQLAlchemy asyncpg.

    Handles common libpq params (sslmode/channel_binding) that asyncpg
    does not accept directly.
    """
    split = urlsplit(raw_url)

    scheme = split.scheme
    if scheme in {"postgres", "postgresql"}:
        scheme = "postgresql+asyncpg"

    query_items = parse_qsl(split.query, keep_blank_values=True)
    normalized: list[tuple[str, str]] = []
    ssl_value: str | None = None

    for key, value in query_items:
        lk = key.lower()
        lv = value.lower()
        if lk == "sslmode":
            # asyncpg supports "ssl", not "sslmode"
            if lv in {"disable", "false", "0"}:
                ssl_value = "false"
            else:
                ssl_value = "require"
            continue
        if lk == "channel_binding":
            # Not supported by asyncpg connect kwargs.
            continue
        normalized.append((key, value))

    has_ssl = any(k.lower() == "ssl" for k, _ in normalized)
    if ssl_value is not None and not has_ssl:
        normalized.append(("ssl", ssl_value))

    query = urlencode(normalized)
    return urlunsplit((scheme, split.netloc, split.path, query, split.fragment))
