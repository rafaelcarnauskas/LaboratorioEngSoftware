import os
import sys
import unittest
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# Garante que `apoio_sessao` (nesta mesma pasta) seja importável também quando o
# arquivo é carregado por run_all.py ou por outro runner a partir de outra pasta.
_PASTA_SELENIUM = str(Path(__file__).resolve().parent)
if _PASTA_SELENIUM not in sys.path:
    sys.path.insert(0, _PASTA_SELENIUM)

from apoio_sessao import EMAIL_DEMONSTRACAO, email_unico  # noqa: E402


# O app e o Backend precisam estar rodando (npm run dev na pasta frontend e
# uvicorn em backend/), com o usuário de demonstração semeado
# (`python -m app.autenticacao.semear` em backend/).
URL_APP = os.environ.get("URL_APP", "http://localhost:5173")


class TestCadastro(unittest.TestCase):
    def setUp(self):
        options = webdriver.ChromeOptions()
        options.add_argument("--window-size=1920,1080")
        if os.environ.get("HEADLESS") == "1":
            options.add_argument("--headless=new")

        # Selenium Manager procura ou gerencia o driver do navegador.
        self.driver = webdriver.Chrome(options=options)
        self.addCleanup(self.driver.quit)
        self.wait = WebDriverWait(self.driver, 10)

        # Cada teste começa sem sessão e sem contas criadas.
        self.driver.get(URL_APP)
        self.driver.execute_script(
            "localStorage.removeItem('choosen.session');"
            "localStorage.removeItem('choosen.accounts')"
        )
        self.driver.get(URL_APP)

        # Do login, o link "Create account" abre o cadastro.
        self.wait.until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, '[data-testid="ir-para-cadastro"]'))
        ).click()
        self.wait.until(EC.visibility_of_element_located((By.ID, "signup-name")))

    def preencher(self, nome="", email="", senha="", confirmacao=""):
        campos = {
            "signup-name": nome,
            "signup-email": email,
            "signup-password": senha,
            "signup-confirm-password": confirmacao,
        }
        for campo_id, valor in campos.items():
            if valor:
                self.driver.find_element(By.ID, campo_id).send_keys(valor)
        self.driver.find_element(By.CSS_SELECTOR, '[data-testid="cadastro-criar"]').click()

    def erro_do_campo(self, campo_id):
        return self.wait.until(
            EC.visibility_of_element_located((By.ID, f"{campo_id}-error"))
        ).text

    def esperar_home(self, primeiro_nome):
        return self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, f"//h1[contains(normalize-space(.), 'Olá, {primeiro_nome}')]")
            )
        )

    def test_cadastro_valido_entra_e_permite_novo_login(self):
        # E-mail novo a cada execução: o Backend guarda as contas, e um e-mail fixo
        # receberia "e-mail já cadastrado" (409) na segunda execução (Requisito 15.8).
        email = email_unico()
        self.preencher("Ana Souza", email, "senhaforte1", "senhaforte1")
        self.esperar_home("Ana")

        # Sai pelo Perfil e entra de novo com a conta recém-criada.
        self.wait.until(
            EC.element_to_be_clickable(
                (By.XPATH, "//nav//button[.//span[normalize-space()='Perfil']]")
            )
        ).click()
        self.wait.until(
            EC.element_to_be_clickable((By.XPATH, "//button[.//span[normalize-space()='Sair']]"))
        ).click()

        self.wait.until(EC.visibility_of_element_located((By.ID, "login-email"))).send_keys(
            email
        )
        self.driver.find_element(By.ID, "login-password").send_keys("senhaforte1")
        self.driver.find_element(By.CSS_SELECTOR, '[data-testid="login-entrar"]').click()
        self.esperar_home("Ana")

    def test_campos_vazios_exibem_mensagens_de_erro(self):
        self.preencher()

        self.assertEqual(self.erro_do_campo("signup-name"), "Name is required.")
        self.assertEqual(self.erro_do_campo("signup-email"), "Email is required.")
        self.assertEqual(self.erro_do_campo("signup-password"), "Password is required.")
        self.assertEqual(
            self.erro_do_campo("signup-confirm-password"), "Please confirm your password."
        )

    def test_email_ja_cadastrado_e_senhas_invalidas(self):
        # O e-mail do usuário de demonstração já existe no Backend (semeadura);
        # senha curta; confirmação diferente.
        self.preencher("Victor", EMAIL_DEMONSTRACAO, "curta", "diferente")

        self.assertEqual(
            self.erro_do_campo("signup-email"), "An account with this email already exists."
        )
        self.assertEqual(
            self.erro_do_campo("signup-password"), "Password must be at least 8 characters."
        )
        self.assertEqual(self.erro_do_campo("signup-confirm-password"), "Passwords do not match.")
        self.assertIsNone(
            self.driver.execute_script("return localStorage.getItem('choosen.session')")
        )

    def test_link_log_in_volta_para_o_login(self):
        self.driver.find_element(By.CSS_SELECTOR, '[data-testid="ir-para-login"]').click()
        self.wait.until(EC.visibility_of_element_located((By.ID, "login-email")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
