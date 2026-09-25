import os
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


# O app precisa estar rodando (npm run dev na pasta frontend).
URL_APP = os.environ.get("URL_APP", "http://localhost:5173")
URL_REELS = f"{URL_APP}/?tela=reels&categoria=sports"

PRIMEIRO_REEL = '[data-reel-id="sports-1"]'
SEGUNDO_REEL = '[data-reel-id="sports-2"]'


class TestReels(unittest.TestCase):
    def setUp(self):
        options = webdriver.ChromeOptions()
        options.add_argument("--window-size=1920,1080")
        if os.environ.get("HEADLESS") == "1":
            options.add_argument("--headless=new")

        # Selenium Manager procura ou gerencia o driver do navegador.
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 10)

        self.driver.get(URL_REELS)

        # Aguarda a tela de loading sumir e o primeiro vídeo aparecer.
        self.wait.until(
            EC.visibility_of_element_located((By.CSS_SELECTOR, PRIMEIRO_REEL))
        )

    def tearDown(self):
        # Fecha o navegador ao final de cada teste.
        if hasattr(self, "driver"):
            self.driver.quit()

    def abrir_comentarios(self, reel):
        botao = reel.find_element(By.CSS_SELECTOR, '[data-testid="abrir-comentarios"]')
        botao.click()
        return self.wait.until(
            EC.visibility_of_element_located((By.ID, "comentario-sports-1"))
        )

    def test_publica_comentario_e_exibe_confirmacao(self):
        reel = self.driver.find_element(By.CSS_SELECTOR, PRIMEIRO_REEL)
        campo_comentario = self.abrir_comentarios(reel)

        campo_comentario.send_keys("Que jogo!")
        reel.find_element(By.CSS_SELECTOR, '[data-testid="acao-principal"]').click()

        mensagem = self.wait.until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, f'{PRIMEIRO_REEL} [role="status"]')
            )
        )
        self.assertEqual(mensagem.text, "Comentário publicado.")

        comentarios = reel.find_elements(
            By.CSS_SELECTOR, '[data-testid="lista-comentarios"] li'
        )
        self.assertEqual(len(comentarios), 1)
        self.assertEqual(comentarios[0].text, "mendesvictor Que jogo!")

        contador = reel.find_element(By.CSS_SELECTOR, '[data-testid="abrir-comentarios"] span')
        self.assertEqual(contador.text, "101")

        self.assertEqual(campo_comentario.get_attribute("value"), "")

    def test_comentario_vazio_exibe_mensagem_de_erro(self):
        reel = self.driver.find_element(By.CSS_SELECTOR, PRIMEIRO_REEL)
        campo_comentario = self.abrir_comentarios(reel)

        reel.find_element(By.CSS_SELECTOR, '[data-testid="acao-principal"]').click()

        mensagem = self.wait.until(
            EC.visibility_of_element_located(
                (By.CSS_SELECTOR, f'{PRIMEIRO_REEL} [role="alert"]')
            )
        )
        self.assertEqual(mensagem.text, "Escreva um comentário antes de publicar.")
        self.assertEqual(campo_comentario.get_attribute("aria-invalid"), "true")

        # Nenhum comentário foi adicionado.
        self.assertEqual(
            len(reel.find_elements(By.CSS_SELECTOR, '[data-testid="lista-comentarios"] li')),
            0,
        )

    def test_seta_para_baixo_mostra_proximo_video(self):
        self.driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ARROW_DOWN)

        # O segundo vídeo precisa "encaixar" logo abaixo da barra do topo.
        segundo_reel = self.driver.find_element(By.CSS_SELECTOR, SEGUNDO_REEL)
        topo_da_pagina = self.driver.find_element(By.CSS_SELECTOR, ".reels-topbar")
        altura_topbar = topo_da_pagina.size["height"]

        self.wait.until(
            lambda driver: abs(segundo_reel.rect["y"] - altura_topbar) <= 2
        )
        self.assertTrue(segundo_reel.is_displayed())


if __name__ == "__main__":
    unittest.main(verbosity=2)
