"""End-to-end tests for user PIN and name validation.

Tests that the server enforces the 4-digit minimum PIN requirement
on both the POST /users (create) and PUT /users/{id} (update) endpoints,
and that blank name/PIN are rejected on create.
"""

import logging
import uuid

import pytest

from ambrosia.api_utils import assert_status_code
from ambrosia.auth_utils import create_role, create_user, with_current_user_pin

logger = logging.getLogger(__name__)


class TestUserPinValidation:
    """Tests for PIN length and name enforcement on the users endpoints."""

    @pytest.fixture
    async def role_id(self, admin_client):
        """Create a temporary role and clean it up after the test."""
        uid = str(uuid.uuid4())[:8]
        rid = await create_role(admin_client, f"test_role_{uid}")
        yield rid
        await admin_client.delete(f"/roles/{rid}", json=with_current_user_pin())

    @pytest.fixture
    async def existing_user(self, admin_client, role_id):
        """Create a temporary user for PUT tests and clean it up after."""
        uid = str(uuid.uuid4())[:8]
        user_id = await create_user(admin_client, f"test_user_{uid}", "1234", role_id)
        yield user_id
        await admin_client.delete(f"/users/{user_id}", json=with_current_user_pin())

    @pytest.mark.asyncio
    async def test_create_user_with_1_digit_pin_fails(self, admin_client, role_id):
        """POST /users with a 1-digit PIN should return 400."""
        one_digit_pin_creation_response = await admin_client.post(
            "/users",
            json=with_current_user_pin(
                {
                    "user": {
                        "name": f"user_{uuid.uuid4().hex[:8]}",
                        "pin": "1",
                        "role": role_id,
                    }
                }
            ),
        )
        assert_status_code(
            one_digit_pin_creation_response,
            400,
            "1-digit PIN should be rejected on create",
        )
        logger.info("✓ 1-digit PIN correctly rejected on create")

    @pytest.mark.asyncio
    async def test_create_user_with_3_digit_pin_fails(self, admin_client, role_id):
        """POST /users with a 3-digit PIN should return 400."""
        three_digit_pin_creation_response = await admin_client.post(
            "/users",
            json=with_current_user_pin(
                {
                    "user": {
                        "name": f"user_{uuid.uuid4().hex[:8]}",
                        "pin": "123",
                        "role": role_id,
                    }
                }
            ),
        )
        assert_status_code(
            three_digit_pin_creation_response,
            400,
            "3-digit PIN should be rejected on create",
        )
        logger.info("✓ 3-digit PIN correctly rejected on create")

    @pytest.mark.asyncio
    async def test_create_user_with_blank_pin_fails(self, admin_client, role_id):
        """POST /users with a blank PIN should return 400."""
        blank_pin_creation_response = await admin_client.post(
            "/users",
            json=with_current_user_pin(
                {
                    "user": {
                        "name": f"user_{uuid.uuid4().hex[:8]}",
                        "pin": "",
                        "role": role_id,
                    }
                }
            ),
        )
        assert_status_code(
            blank_pin_creation_response, 400, "Blank PIN should be rejected on create"
        )
        logger.info("✓ Blank PIN correctly rejected on create")

    @pytest.mark.asyncio
    async def test_create_user_with_blank_name_fails(self, admin_client, role_id):
        """POST /users with a blank name should return 400."""
        blank_name_creation_response = await admin_client.post(
            "/users",
            json=with_current_user_pin(
                {"user": {"name": "", "pin": "1234", "role": role_id}}
            ),
        )
        assert_status_code(
            blank_name_creation_response, 400, "Blank name should be rejected on create"
        )
        logger.info("✓ Blank name correctly rejected on create")

    @pytest.mark.asyncio
    async def test_update_user_with_blank_name_fails(self, admin_client, existing_user):
        """PUT /users/{id} with a blank name should return 400."""
        blank_name_update_response = await admin_client.put(
            f"/users/{existing_user}",
            json=with_current_user_pin({"name": ""}),
        )
        assert_status_code(
            blank_name_update_response, 400, "Blank name should be rejected on update"
        )
        logger.info("✓ Blank name correctly rejected on update")

    @pytest.mark.asyncio
    async def test_create_user_with_valid_pin_succeeds(self, admin_client, role_id):
        """POST /users with a valid 4-digit PIN should return 201."""
        valid_pin_creation_response = await admin_client.post(
            "/users",
            json=with_current_user_pin(
                {
                    "user": {
                        "name": f"user_{uuid.uuid4().hex[:8]}",
                        "pin": "1234",
                        "role": role_id,
                    }
                }
            ),
        )
        assert_status_code(
            valid_pin_creation_response,
            201,
            "Valid 4-digit PIN should be accepted on create",
        )
        await admin_client.delete(
            f"/users/{valid_pin_creation_response.json()['id']}",
            json=with_current_user_pin(),
        )
        logger.info("✓ Valid 4-digit PIN correctly accepted on create")

    @pytest.mark.asyncio
    async def test_update_user_with_1_digit_pin_fails(
        self, admin_client, existing_user
    ):
        """PUT /users/{id} with a 1-digit PIN should return 400."""
        one_digit_pin_update_response = await admin_client.put(
            f"/users/{existing_user}",
            json=with_current_user_pin({"pin": "1"}),
        )
        assert_status_code(
            one_digit_pin_update_response,
            400,
            "1-digit PIN should be rejected on update",
        )
        logger.info("✓ 1-digit PIN correctly rejected on update")

    @pytest.mark.asyncio
    async def test_update_user_with_3_digit_pin_fails(
        self, admin_client, existing_user
    ):
        """PUT /users/{id} with a 3-digit PIN should return 400."""
        three_digit_pin_update_response = await admin_client.put(
            f"/users/{existing_user}",
            json=with_current_user_pin({"pin": "123"}),
        )
        assert_status_code(
            three_digit_pin_update_response,
            400,
            "3-digit PIN should be rejected on update",
        )
        logger.info("✓ 3-digit PIN correctly rejected on update")

    @pytest.mark.asyncio
    async def test_update_user_with_blank_pin_succeeds(
        self, admin_client, existing_user
    ):
        """PUT /users/{id} with a blank PIN should return 200 (blank means keep existing PIN)."""
        blank_pin_update_response = await admin_client.put(
            f"/users/{existing_user}",
            json=with_current_user_pin(
                {"pin": "", "name": f"updated_user_{uuid.uuid4().hex[:8]}"}
            ),
        )
        assert_status_code(
            blank_pin_update_response,
            200,
            "Blank PIN should be accepted on update (no PIN change)",
        )
        logger.info("✓ Blank PIN correctly accepted on update (no change)")

    @pytest.mark.asyncio
    async def test_update_user_with_valid_pin_succeeds(
        self, admin_client, existing_user
    ):
        """PUT /users/{id} with a valid 4-digit PIN should return 200."""
        valid_pin_update_response = await admin_client.put(
            f"/users/{existing_user}",
            json=with_current_user_pin({"pin": "5678"}),
        )
        assert_status_code(
            valid_pin_update_response,
            200,
            "Valid 4-digit PIN should be accepted on update",
        )
        logger.info("✓ Valid 4-digit PIN correctly accepted on update")
