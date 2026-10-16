"""Executa juntas as suítes Selenium (login, cadastro, telas principais e Finds), de qualquer diretório."""
import importlib.util
from pathlib import Path
import unittest


def main():
    pasta = Path(__file__).resolve().parent
    test_files = (
        ("tests_login", pasta / "test_login.py"),
        ("tests_cadastro", pasta / "test_cadastro.py"),
        ("tests_app", pasta / "test_app.py"),
        ("tests_finds", pasta / "test_finds.py"),
    )
    suite = unittest.TestSuite()
    for name, path in test_files:
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        suite.addTests(unittest.defaultTestLoader.loadTestsFromModule(module))

    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
