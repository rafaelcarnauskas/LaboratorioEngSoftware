import os
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# O app precisa estar rodando (npm run dev na pasta frontend).
URL_APP = os.environ.get("URL_APP", "http://localhost:5173")

# Usuário de demonstração criado no Backend pela semeadura
# (`python -m app.autenticacao.semear` em backend/, com CHOOSEN_ENV=development).
EMAIL_TESTE = "victor@email.com"
SENHA_TESTE = "choosen123"


class TestLogin(unittest.TestCase):
    def setUp(self):
        options = webdriver.ChromeOptions()
        options.add_argument("--window-size=1920,1080")
        if os.environ.get("HEADLESS") == "1":
            options.add_argument("--headless=new")

        # Selenium Manager procura ou gerencia o driver do navegador.
        self.driver = webdriver.Chrome(options=options)
        self.addCleanup(self.driver.quit)
        self.wait = WebDriverWait(self.driver, 10)

        # Cada teste começa sem sessão salva, como na primeira vez que o app é aberto.
        self.driver.get(URL_APP)
        self.driver.execute_script("localStorage.removeItem('choosen.session')")
        self.driver.get(URL_APP)

        # Aguarda a tela de loading sumir e o formulário de login aparecer.
        self.wait.until(EC.visibility_of_element_located((By.ID, "login-email")))

    def entrar(self, email, senha):
        if email:
            self.driver.find_element(By.ID, "login-email").send_keys(email)
        if senha:
            self.driver.find_element(By.ID, "login-password").send_keys(senha)
        self.driver.find_element(By.CSS_SELECTOR, '[data-testid="login-entrar"]').click()

    def esperar_home(self):
        return self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, "//h1[contains(normalize-space(.), 'Olá, Victor')]")
            )
        )

    def test_login_valido_abre_home_e_lembra_usuario(self):
        self.entrar(EMAIL_TESTE, SENHA_TESTE)
        self.esperar_home()

        # Ao abrir o app de novo, o login não aparece: o usuário foi lembrado.
        self.driver.get(URL_APP)
        self.esperar_home()
        self.assertEqual(len(self.driver.find_elements(By.ID, "login-email")), 0)

    def test_campos_vazios_exibem_mensagens_de_erro(self):
        self.entrar("", "")

        erro_email = self.wait.until(
            EC.visibility_of_element_located((By.ID, "login-email-error"))
        )
        erro_senha = self.driver.find_element(By.ID, "login-password-error")
        self.assertEqual(erro_email.text, "Email is required.")
        self.assertEqual(erro_senha.text, "Password is required.")
        self.assertEqual(
            self.driver.find_element(By.ID, "login-email").get_attribute("aria-invalid"),
            "true",
        )
        self.assertEqual(
            self.driver.find_element(By.ID, "login-password").get_attribute("aria-invalid"),
            "true",
        )

    def test_email_invalido_exibe_mensagem_de_erro(self):
        self.entrar("victor@email", SENHA_TESTE)

        erro_email = self.wait.until(
            EC.visibility_of_element_located((By.ID, "login-email-error"))
        )
        self.assertEqual(erro_email.text, "Enter a valid email address.")

    def test_senha_incorreta_exibe_aviso_e_nao_entra(self):
        self.entrar(EMAIL_TESTE, "senhaerrada")

        aviso = self.wait.until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, '[data-testid="login-erro"][role="alert"]')
            )
        )
        self.assertEqual(aviso.text, "Incorrect email or password. Please try again.")
        self.assertIsNone(
            self.driver.execute_script("return localStorage.getItem('choosen.session')")
        )

    def test_sair_volta_para_o_login(self):
        self.entrar(EMAIL_TESTE, SENHA_TESTE)
        self.esperar_home()

        self.wait.until(
            EC.element_to_be_clickable(
                (By.XPATH, "//nav//button[.//span[normalize-space()='Perfil']]")
            )
        ).click()
        self.wait.until(
            EC.element_to_be_clickable(
                (By.XPATH, "//button[.//span[normalize-space()='Sair']]")
            )
        ).click()

        self.wait.until(EC.visibility_of_element_located((By.ID, "login-email")))

        # Depois de sair, abrir o app de novo mostra o login.
        self.driver.get(URL_APP)
        self.wait.until(EC.visibility_of_element_located((By.ID, "login-email")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
