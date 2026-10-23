import { useEffect, useRef, useState } from 'react'
import { mensagemDeErro, resetPassword } from '../orquestrador'
import { MENSAGEM_TAMANHO_SENHA, validarRedefinicao } from '../modelo/redefinicao'
import logoMark from '../../assets/finds/icons/logo-mark.svg'
import './Login.css'

// A validação pura mora em `modelo/redefinicao.js` (testável sem React) e é
// reexportada aqui como a função de validação do formulário (Property 29).
// eslint-disable-next-line react-refresh/only-export-components
export { validarRedefinicao }

// Etapas da tela: formulário, sucesso (16.6) ou link inválido (16.7, 16.8).
const ETAPA_FORMULARIO = 'formulario'
const ETAPA_SUCESSO = 'sucesso'
const ETAPA_TOKEN_INVALIDO = 'token-invalido'

function tokenPresente(token) {
  return typeof token === 'string' && token !== ''
}

// Tela_Redefinir_Senha. O `token` vem do App.jsx (lido da URL no carregamento)
// e fica só em memória; nenhuma mensagem o interpola, nem a senha (16.13).
function ResetPassword({ token, onGoToLogin, onGoToForgot }) {
  // Sem token: só o aviso de link inválido, sem requisição (16.8).
  const [etapa, setEtapa] = useState(() =>
    tokenPresente(token) ? ETAPA_FORMULARIO : ETAPA_TOKEN_INVALIDO,
  )
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // A ref bloqueia um segundo envio no mesmo tick, antes do re-render que
  // desabilita o botão (16.11, 12.13).
  const enviandoRef = useRef(false)
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  function handlePasswordChange(event) {
    setPassword(event.target.value)
    setFieldErrors((current) => ({ ...current, password: undefined }))
    setFormError('')
  }

  function handleConfirmChange(event) {
    setConfirmPassword(event.target.value)
    setFieldErrors((current) => ({ ...current, confirmPassword: undefined }))
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (enviandoRef.current) return
    if (!tokenPresente(token)) {
      setEtapa(ETAPA_TOKEN_INVALIDO)
      return
    }

    // Validação local: com erro, nada é enviado e os valores ficam (16.4).
    const errors = validarRedefinicao(password, confirmPassword)
    setFieldErrors(errors)
    if (errors.password || errors.confirmPassword) {
      setFormError('')
      return
    }

    enviandoRef.current = true
    setEnviando(true)
    setFormError('')

    let resultado
    try {
      // Token lido da URL e a senha sem alteração (16.5).
      resultado = await resetPassword(token, password)
    } catch (erro) {
      // Conexão, timeout ou 5xx: mensagem do mapa único; valores e token
      // mantidos e botão reabilitado no `finally` (16.9, 16.12).
      if (montadoRef.current) setFormError(mensagemDeErro(erro))
      return
    } finally {
      enviandoRef.current = false
      if (montadoRef.current) setEnviando(false)
    }

    if (!montadoRef.current) return

    if (resultado === 'ok') {
      // A Comunicacao_Frontend já removeu `choosen.session` (16.6).
      setPassword('')
      setConfirmPassword('')
      setEtapa(ETAPA_SUCESSO)
    } else if (resultado === 'senha-invalida') {
      setFieldErrors({ password: MENSAGEM_TAMANHO_SENHA })
    } else {
      // 'token-invalido': desconhecido, usado ou expirado (16.7).
      setEtapa(ETAPA_TOKEN_INVALIDO)
    }
  }

  return (
    <main className="login-page" aria-label="Set a new Choosen password">
      <div className="login-brand">
        <img src={logoMark} alt="" width="90" height="90" />
        <p className="login-brand-name">Choosen</p>
      </div>

      <section className="login-card" aria-labelledby="reset-title">
        <header className="login-header">
          <h1 id="reset-title">
            {etapa === ETAPA_TOKEN_INVALIDO ? 'Reset link invalid' : 'Set a new password'}
          </h1>
          {etapa === ETAPA_FORMULARIO && (
            <p>Choose a new password for your Choosen account.</p>
          )}
        </header>

        {etapa === ETAPA_TOKEN_INVALIDO && (
          <>
            <p className="login-banner" role="alert" data-testid="redefinir-token-invalido">
              This password reset link is invalid or has expired. Request a new link to reset your
              password.
            </p>
            <button
              className="login-submit"
              type="button"
              onClick={onGoToForgot}
              data-testid="ir-para-esqueci-senha"
            >
              Request a new link
            </button>
          </>
        )}

        {etapa === ETAPA_SUCESSO && (
          <>
            <p
              className="login-banner login-banner--success"
              role="status"
              data-testid="redefinir-sucesso"
            >
              Your password has been reset. You can now log in with your new password.
            </p>
            <button
              className="login-submit"
              type="button"
              onClick={onGoToLogin}
              data-testid="voltar-para-login"
            >
              Back to log in
            </button>
          </>
        )}

        {etapa === ETAPA_FORMULARIO && (
          <>
            <form className="login-form" noValidate onSubmit={handleSubmit}>
              {formError && (
                <p className="login-banner" role="alert" data-testid="redefinir-erro">
                  {formError}
                </p>
              )}

              <div className="login-field">
                <label htmlFor="reset-password">New password</label>
                <div className="login-input">
                  <input
                    id="reset-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="8 to 128 characters"
                    value={password}
                    onChange={handlePasswordChange}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'reset-password-error' : undefined}
                  />
                </div>
                {fieldErrors.password && (
                  <p className="login-field-error" id="reset-password-error" role="alert">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <div className="login-field">
                <label htmlFor="reset-confirm-password">Confirm new password</label>
                <div className="login-input">
                  <input
                    id="reset-confirm-password"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repeat the new password"
                    value={confirmPassword}
                    onChange={handleConfirmChange}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={
                      fieldErrors.confirmPassword ? 'reset-confirm-password-error' : undefined
                    }
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="login-field-error" id="reset-confirm-password-error" role="alert">
                    {fieldErrors.confirmPassword}
                  </p>
                )}
              </div>

              <button
                className="login-submit"
                type="submit"
                data-testid="redefinir-enviar"
                disabled={enviando}
                aria-busy={enviando}
              >
                {enviando ? 'Saving…' : 'Reset password'}
              </button>
            </form>

            <p className="login-signup">
              Remembered it?{' '}
              <button
                className="login-link login-link--strong"
                type="button"
                onClick={onGoToLogin}
                data-testid="redefinir-cancelar"
              >
                Back to log in
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  )
}

export default ResetPassword
