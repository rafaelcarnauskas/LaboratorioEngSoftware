import os
import unittest
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


URL = os.environ.get("URL_APP", "http://localhost:5173")
EVIDENCE_DIR = Path(__file__).resolve().parent / "test-results" / "victor"


class TestChoosen(unittest.TestCase):
    def setUp(self):
        options = webdriver.ChromeOptions()
        options.add_argument("--window-size=1920,1080")
        if os.environ.get("HEADLESS") == "1":
            options.add_argument("--headless=new")
        self.driver = webdriver.Chrome(options=options)
        self.addCleanup(self.driver.quit)
        self.wait = WebDriverWait(self.driver, 10)
        self.driver.get(URL)

        # A navegacao so aparece depois da tela inicial de loading.
        self.wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, ".sidebar-nav"))
        )
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

    def clicar(self, xpath):
        elemento = self.wait.until(
            EC.element_to_be_clickable((By.XPATH, xpath))
        )
        elemento.click()
        return elemento

    def navegar(self, aba):
        self.clicar(
            f"//nav//button[.//span[normalize-space()='{aba}']]"
        )

    def screenshot(self, nome):
        self.driver.save_screenshot(str(EVIDENCE_DIR / nome))

    # -------------------------
    # Home
    # -------------------------
    def test_home_busca_filtra_categoria(self):
        self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, "//h1[contains(normalize-space(.), 'Hi, Victor')]")
            )
        )

        campo_busca = self.wait.until(
            EC.element_to_be_clickable(
                (By.CSS_SELECTOR, "input[placeholder='Search videos...']")
            )
        )
        campo_busca.send_keys(Keys.CONTROL, "a")
        campo_busca.send_keys("Technology")

        self.wait.until(
            lambda driver: len(driver.find_elements(By.CSS_SELECTOR, ".category-card")) == 1
        )

        nomes = [
            elemento.text.strip()
            for elemento in self.driver.find_elements(
                By.CSS_SELECTOR, ".category-card .category-copy strong"
            )
        ]
        self.assertEqual(nomes, ["Technology"])
        self.screenshot("01_home_filtro_technology.png")

    # -------------------------
    # Profile
    # -------------------------
    def test_profile_exibe_dados_principais(self):
        self.navegar("Profile")

        titulo = self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, "//h1[normalize-space()='Profile Settings']")
            )
        )
        self.assertTrue(titulo.is_displayed())

        usuario = self.wait.until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, ".profile-user strong"))
        )
        self.assertEqual(usuario.text.strip(), "Victor Mendes")
        self.screenshot("02_profile.png")

    def abrir_my_time(self):
        self.navegar("Profile")
        self.clicar(
            "//button[contains(@class, 'profile-action')][.//span[normalize-space()='My time']]"
        )
        self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, "//h1[normalize-space()='My Time']")
            )
        )

    # -------------------------
    # My Time
    # -------------------------
    def test_my_time_altera_limite_diario(self):
        self.abrir_my_time()

        botao_30 = self.clicar(
            "//div[contains(@class, 'usage-limit-options')]//button[normalize-space()='30 min']"
        )

        self.wait.until(
            lambda driver: botao_30.get_attribute("aria-pressed") == "true"
        )
        self.wait.until(
            EC.text_to_be_present_in_element(
                (By.CSS_SELECTOR, ".time-status"),
                "Limit reached",
            )
        )

        limite = self.driver.find_element(
            By.CSS_SELECTOR, ".screen-time-number-row span"
        ).text.strip()
        self.assertEqual(limite, "30 min limit")
        self.screenshot("03_my_time_limite_30.png")

    def test_my_time_ativa_resumo_semanal(self):
        self.abrir_my_time()

        toggle = self.wait.until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//button[@role='switch' and contains(@aria-label, 'Weekly Summary Report')]",
                )
            )
        )
        self.assertEqual(toggle.get_attribute("aria-checked"), "false")
        toggle.click()

        self.wait.until(
            lambda driver: toggle.get_attribute("aria-checked") == "true"
        )
        self.assertEqual(toggle.get_attribute("aria-checked"), "true")
        self.screenshot("04_my_time_resumo_semanal_ativo.png")

    def test_my_time_volta_para_profile(self):
        self.abrir_my_time()
        self.clicar("//button[contains(normalize-space(.), 'Back to Profile')]")

        titulo = self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, "//h1[normalize-space()='Profile Settings']")
            )
        )
        self.assertTrue(titulo.is_displayed())

    # -------------------------
    # History
    # -------------------------
    def test_history_limpa_historico(self):
        self.navegar("History")

        self.wait.until(
            EC.visibility_of_element_located(
                (By.XPATH, "//h1[normalize-space()='History']")
            )
        )

        cartoes_antes = self.wait.until(
            lambda driver: driver.find_elements(By.CSS_SELECTOR, ".history-card")
        )
        self.assertGreater(len(cartoes_antes), 0)

        self.clicar("//button[normalize-space()='Clear history']")

        vazio = self.wait.until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, ".history-empty"))
        )
        self.assertIn("No watch history yet", vazio.text)

        botao_limpar = self.driver.find_element(
            By.XPATH, "//button[normalize-space()='Clear history']"
        )
        self.assertTrue(botao_limpar.get_attribute("disabled") is not None)
        self.screenshot("05_history_limpo.png")

    # -------------------------
    # Lists
    # -------------------------
    def abrir_dialogo_nova_lista(self):
        self.navegar("Lists")
        self.clicar("//button[contains(normalize-space(.), 'New list')]")

        return self.wait.until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, ".lists-dialog .lists-field input")
            )
        )

    def test_criar_lista(self):
        campo = self.abrir_dialogo_nova_lista()
        campo.send_keys("Teste Selenium")
        self.clicar("//dialog//button[@type='submit']")

        self.wait.until(
            EC.text_to_be_present_in_element(
                (By.CSS_SELECTOR, ".lists-status"),
                "created.",
            )
        )

        cartao = self.wait.until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, 'button[aria-label="Open Teste Selenium"]')
            )
        )
        self.assertTrue(cartao.is_displayed())
        self.screenshot("06_lista_criada.png")

    def test_rejeitar_nome_so_com_espacos(self):
        campo = self.abrir_dialogo_nova_lista()
        campo.send_keys("   ")
        self.clicar("//dialog//button[@type='submit']")

        erro = self.wait.until(
            EC.visibility_of_element_located((By.ID, "list-name-error"))
        )
        self.assertEqual(
            erro.text,
            "Give your list a name to continue.",
        )
        self.assertEqual(campo.get_attribute("aria-invalid"), "true")
        self.screenshot("07_lista_nome_invalido.png")


    # Regressões da integração entre as branches victor e murilo/reels.
    def test_home_reels_lists_search_integrados(self):
        for category, first_reel in (("Sports", "sports-1"), ("Cute", "cute-1")):
            with self.subTest(category=category):
                self.clicar(
                    f"//button[contains(@class, 'category-card')][.//strong[text()='{category}']]"
                )
                self.wait.until(EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, f'[data-reel-id="{first_reel}"]')
                ))
                self.clicar("//button[@aria-label='Home']")
                self.wait.until(EC.visibility_of_element_located(
                    (By.CSS_SELECTOR, ".category-grid")
                ))

        self.navegar("Lists")
        self.wait.until(EC.visibility_of_element_located(
            (By.CSS_SELECTOR, ".lists-view h1")
        ))
        self.navegar("Search")
        self.wait.until(EC.element_to_be_clickable(
            (By.ID, "discover-videos")
        )).send_keys("3D")
        self.wait.until(lambda driver: len(driver.find_elements(
            By.CSS_SELECTOR, ".search-video-card"
        )) == 1)
        self.assertEqual(
            self.driver.find_element(By.CSS_SELECTOR, ".search-video-card h3").text,
            "How a 3D printer builds layer by layer",
        )

    def test_search_salva_video_em_nova_lista(self):
        self.navegar("Search")
        self.wait.until(EC.element_to_be_clickable(
            (By.ID, "discover-videos")
        )).send_keys("3D")
        self.clicar("//button[@aria-label='Save How a 3D printer builds layer by layer']")
        self.clicar("//dialog//button[contains(., 'Create a new list')]")
        self.wait.until(EC.element_to_be_clickable(
            (By.CSS_SELECTOR, ".search-new-list-field input")
        )).send_keys("Integração Search e Lists")
        self.clicar("//dialog//button[@type='submit']")
        self.wait.until(EC.text_to_be_present_in_element(
            (By.CSS_SELECTOR, ".search-feedback"), "saved in 1 list."
        ))
        self.navegar("Lists")
        self.clicar("//button[@aria-label='Open Integração Search e Lists']")
        video = self.wait.until(EC.visibility_of_element_located(
            (By.CSS_SELECTOR, ".lists-video-copy h2")
        ))
        self.assertEqual(video.text, "How a 3D printer builds layer by layer")


if __name__ == "__main__":
    unittest.main(verbosity=2)
