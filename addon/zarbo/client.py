"""Zarbo API client. No bpy imports: testable outside Blender."""
from dataclasses import dataclass
from pathlib import Path

import requests

DEFAULT_HOST = "https://api.zarbo.tech"
EMBED_HOST = "https://embed.zarbo.tech"

WIDGET_DEFAULTS = {
    "loading_type": "auto",
    "ar": True,
    "ar_scale": True,
    "ar_mode": "webxr quick-look scene-viewer",
    "camera_controls": True,
    "disable_zoom": False,
    "change_material": True,
}


class ZarboError(Exception):
    pass


@dataclass
class ZarboClient:
    api_key: str
    host: str = DEFAULT_HOST
    timeout: float = 120

    @property
    def base(self) -> str:
        return self.host.rstrip("/") + "/api/v1"

    def _request(self, method: str, path: str, expect: int, **kwargs) -> dict:
        resp = requests.request(
            method, self.base + path,
            headers={"Authorization": f"Api-Key {self.api_key}"},
            timeout=self.timeout, **kwargs,
        )
        if resp.status_code != expect:
            try:
                detail = resp.json()
            except ValueError:
                detail = resp.text[:300]
            raise ZarboError(f"{method} {path} -> {resp.status_code}: {detail}")
        return resp.json()

    def validate(self) -> None:
        self._request("GET", "/collections/", 200)

    def create_collection(self, name: str) -> dict:
        return self._request("POST", "/collections/", 201, data={"name": name})

    def create_product(self, collection_id: int, guid: str, name: str, description: str = "") -> dict:
        return self._request("POST", "/products/", 201, data={
            "collection_id": collection_id, "guid": guid, "name": name, "description": description,
        })

    def set_product_tags(self, product_id: int, tags: str) -> dict:
        return self._request("PATCH", f"/products/{product_id}/", 200, data={"tags": tags})

    def upload_model(self, product_id: int, path: Path, additional_data: str) -> dict:
        """additional_data is mandatory in practice: without it the model uploads but is shown nowhere."""
        with open(path, "rb") as f:
            return self._request(
                "POST", "/models/", 201,
                data={"product_id": product_id, "additional_data": additional_data},
                files={"file": (path.name, f)},
            )

    def find_widget(self, product_id: int) -> dict | None:
        results = self._request("GET", "/widgets/", 200, params={"product": product_id}).get("results")
        return results[0] if results else None

    def create_widget(self, product_id: int, **overrides) -> dict:
        return self._request("POST", "/widgets/", 201, data={"product_id": product_id, **WIDGET_DEFAULTS, **overrides})

    def ensure_widget(self, product_id: int) -> dict:
        """Auto-created widgets are unreliable, so create one explicitly when missing."""
        return self.find_widget(product_id) or self.create_widget(product_id)

    def update_widget(self, widget_id: int, **fields) -> dict:
        """camera_orbit / shadow_intensity / shadow_softness: not in Postman, found by diffing the UI."""
        return self._request("PATCH", f"/widgets/{widget_id}/", 200, data=fields)

    @staticmethod
    def embed_url(widget: dict) -> str:
        # product.uuid from the widget payload — not product_id and not widget.uuid.
        return f"{EMBED_HOST}/{widget['product']['uuid']}/{widget['id']}/"


def publish(client: ZarboClient, collection_id: int, guid: str, name: str, description: str,
            tags: str, glb: Path, usdz: Path | None, widget_fields: dict) -> tuple[dict, str]:
    product = client.create_product(collection_id, guid, name, description)
    if tags:
        client.set_product_tags(product["id"], tags)

    if usdz:
        client.upload_model(product["id"], glb, "3d ar_android")
        client.upload_model(product["id"], usdz, "ar_ios")
    else:
        client.upload_model(product["id"], glb, "3d ar_android ar_ios")

    widget = client.ensure_widget(product["id"])
    if widget_fields:
        client.update_widget(widget["id"], **widget_fields)
    return product, client.embed_url(widget)
