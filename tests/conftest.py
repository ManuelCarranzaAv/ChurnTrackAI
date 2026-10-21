"""Keep test artifacts inside the workspace on restricted Windows hosts."""
import uuid
from pathlib import Path
import pytest

@pytest.fixture
def tmp_path():
    path=Path('runtime/tests')/str(uuid.uuid4())
    path.mkdir(parents=True)
    return path.resolve()
