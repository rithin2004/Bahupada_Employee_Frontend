from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Bahu ERP API"
    env: str = "dev"
    api_prefix: str = "/api/v1"

    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/bahu"
    test_database_url: str | None = None
    db_pool_size: int = 20
    db_max_overflow: int = 10
    db_pool_timeout_seconds: int = 30
    db_pool_recycle_seconds: int = 1800
    db_log_sql_timings: bool = True
    db_log_sql_max_length: int = 240

    jwt_secret_key: str = "change_me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 14

    google_maps_api_key: str | None = None
    celery_broker_url: str = "amqp://guest:guest@localhost:5672//"
    celery_result_backend: str = "rpc://"
    celery_task_default_queue: str = "default"
    celery_task_delivery_queue: str = "delivery"
    celery_task_report_queue: str = "reports"
    celery_worker_prefetch_multiplier: int = 1
    celery_task_acks_late: bool = True
    celery_task_time_limit_seconds: int = 300

    gzip_enabled: bool = True
    gzip_minimum_size_bytes: int = 1024
    cors_allow_origins: str = "*"

    pagination_default_page_size: int = 50
    pagination_max_page_size: int = 100
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    aws_region: str | None = None
    s3_bucket_name: str | None = None
    s3_endpoint_url: str | None = None
    s3_docs_prefix: str = "customer-docs"

    @model_validator(mode="after")
    def _prefer_test_database_url(self):
        if self.database_url == "postgresql+asyncpg://postgres:postgres@localhost:5432/bahu" and self.test_database_url:
            self.database_url = self.test_database_url
        return self


settings = Settings()
