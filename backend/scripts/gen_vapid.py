"""
Print a new VAPID key pair for Web Push. Run once, then set both values as
environment variables on Render (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).

    cd backend && python -m scripts.gen_vapid

Keep the private key secret. Changing the keys later invalidates every
existing browser subscription (users just click "Enable" again).
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    private = key.private_numbers().private_value.to_bytes(32, "big")
    public = key.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint,
    )
    print(f"VAPID_PUBLIC_KEY={_b64(public)}")
    print(f"VAPID_PRIVATE_KEY={_b64(private)}")


if __name__ == "__main__":
    main()
