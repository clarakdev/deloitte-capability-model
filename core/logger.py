from pathlib import Path
from datetime import datetime, timezone


def log_security_event(username: str, role: str, action: str, status: str, details: str = "") -> None:
    """Append a security event entry to the audit log in a structured format.

    The function records a single authentication or authorization event using a
    consistent human-readable layout that includes a UTC timestamp, the event
    status, the acting user, the action taken, and any supporting details.
    """
    # Resolve the target directory relative to the repository's data folder.
    # Using Path("data") keeps the code portable for the current project layout,
    # while the caller can still rely on the log file being written in a stable
    # location when the application runs from the repository root.
    data_dir: Path = Path("data")
    # Create the directory tree if it does not already exist without raising an
    # error when it is present. parents=True ensures parent folders are created,
    # and exist_ok=True prevents failures if the directory already exists.
    data_dir.mkdir(parents=True, exist_ok=True)

    # Build the concrete audit log path inside the data directory.
    log_file: Path = data_dir / "security_audit.log"
    # Capture the exact UTC time of the event so every record is timestamped in a
    # standard, human-readable way for audit review and forensic analysis.
    timestamp: str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    # Construct the log line with a fixed layout so log entries remain easy to
    # parse, review, and compare across successful and failed security events.
    identity_value: str = str(username or "unknown").strip() or "unknown"
    role_value: str = str(role or "unknown").strip() or "unknown"
    entry: str = (
        f"[{timestamp}] [STATUS: {status}] User: {identity_value} ({role_value}) | "
        f"Action: {action} | Details: {details}"
    )

    # Open the audit file in append mode so new security events are added to the
    # end of the log without overwriting existing records. UTF-8 encoding ensures
    # the log remains readable and safe for international characters in usernames,
    # roles, or action details, while preserving a reliable audit trail.
    with log_file.open("a", encoding="utf-8") as handle:
        handle.write(entry + "\n")
