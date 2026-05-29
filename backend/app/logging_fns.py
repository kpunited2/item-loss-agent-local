import time
import logging

from starlette.middleware.base import BaseHTTPMiddleware


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Logs method, path, status code, and duration for every request.
    """

    async def dispatch(self, request, call_next):
        logger = logging.getLogger()
        start = time.time()

        try:
            response = await call_next(request)
        except Exception as exc:
            duration = time.time() - start
            logger.error(
                "Unhandled exception",
                extra={
                    "json_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "duration_ms": round(duration * 1000),
                        "error": str(exc),
                    }
                },
            )
            raise

        duration = time.time() - start
        logger.info(
            "Request completed",
            extra={
                "json_fields": {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round(duration * 1000),
                }
            },
        )
        return response