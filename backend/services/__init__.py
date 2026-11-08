"""Serviços de integração externa do backend."""

from .product_storage import (
    ProductStorage,
    ProductStorageError,
    get_product_storage,
)
from .review_storage import (
    ReviewStorage,
    ReviewStorageError,
    get_review_storage,
)

__all__ = [
    "ProductStorage",
    "ProductStorageError",
    "get_product_storage",
    "ReviewStorage",
    "ReviewStorageError",
    "get_review_storage",
]
