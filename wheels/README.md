# Optional offline dependency cache

This folder is empty of packages by default. Docker downloads dependencies from PyPI normally.
If the Docker network is slow, place the complete Python 3.12 Linux x86-64 wheel set here.
The Dockerfile automatically uses the local wheels without contacting PyPI when wheels exist.
Wheel files are ignored by Git. The build fails if a partial cache cannot satisfy requirements;
it does not silently mix unverified versions or fall back to another dependency set.

From the project root, with Python and pip installed:

```sh
python -m pip download -r requirements.txt --platform manylinux2014_x86_64 --platform manylinux_2_27_x86_64 --platform manylinux_2_28_x86_64 --python-version 312 --implementation cp --abi cp312 --only-binary=:all: -d wheels
docker compose build backend
```

These wheels are specific to Linux x86-64, as used by this Docker Desktop installation.
For ARM64 Docker hosts, use the normal online build or download the corresponding platform's wheels.
