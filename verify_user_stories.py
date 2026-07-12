import os
import sys
from fastapi.testclient import TestClient

from app import app


def green(text: str) -> str:
    return f"\033[92m{text}\033[0m"


def red(text: str) -> str:
    return f"\033[91m{text}\033[0m"


client = TestClient(app)

# Test 1: Employee self-service access should succeed for their own fit breakdown.
employee_login_payload = {"username": "xavier_green", "password": "password123"}
employee_login_response = client.post("/login", json=employee_login_payload)
if employee_login_response.status_code != 200:
    print(red("US019 Failed"))
    print(employee_login_response.text)
    sys.exit(1)

employee_token = employee_login_response.json()["access_token"]
headers = {"Authorization": f"Bearer {employee_token}"}

self_fit_response = client.get(
    "/roles/ROLE001/candidates/EMP004/fit",
    headers=headers,
)
if self_fit_response.status_code == 200:
    print(green("US019 Passed"))
else:
    print(red("US019 Failed"))
    print(self_fit_response.text)
    sys.exit(1)

# Test 2: Employee should not access another employee's fit breakdown.
other_fit_response = client.get(
    "/roles/ROLE001/candidates/EMP001/fit",
    headers=headers,
)
if other_fit_response.status_code == 403:
    print(green("US020 Lateral Isolation Passed"))
else:
    print(red("US020 Lateral Isolation Failed"))
    print(other_fit_response.text)
    sys.exit(1)

# Test 3: Employee should be blocked from the master candidate list.
master_candidates_response = client.get(
    "/roles/ROLE001/candidates",
    headers=headers,
)
if master_candidates_response.status_code == 403:
    print(green("US020 Privilege Escalation Passed"))
else:
    print(red("US020 Privilege Escalation Failed"))
    print(master_candidates_response.text)
    sys.exit(1)
