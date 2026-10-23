import { useEffect, useRef, useState } from 'react'
import {
  isValidEmail,
  MENSAGEM_EMAIL_INVALIDO,
  mensagemDeErro,
  mensagemDoCampo,
  requestPasswordReset,
} from '../orquestrador'
import logoMark from '../../assets/finds/icons/logo-mark.svg'
import './Login.css'

const MENSAGEM_PEDIDO_NAO_ENVIADO = "We couldn't send your reset request."

// "Esqueci a senha": pede o e-mail ao Backend e confirma o envio das instruções.
// A confirmação é a mesma exista ou não uma conta com o e-mail (5.2, 5.8).
function ForgotPassword({ onGoToLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [enviando, setEnviando] = useState(false)

  // A ref bloqueia um segundo envio no mesmo tick, antes do re-render que
  // desabilita o botão (12.12).
  const enviandoRef = useRef(false)
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  function handleChange(event) {
    setEmail(event.target.value)
    setError('')
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (enviandoRef.current) return

    // Validação local: com erro, o Orquestrador_Acesso não é acionado e o
    // valor digitado é mantido (5.9).
    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (!isValidEmail(email)) {
      setError(MENSAGEM_EMAIL_INVALIDO)
      return
    }

    enviandoRef.current = true
    setEnviando(true)
    setError('')
    setFormError('')

    try {
      await requestPasswordReset(email)
    } catch (erro) {
      // Rede, timeout, 5xx ou outro status: pedido não enviado, e-mail mantido,
      // sem `recuperar-sucesso` (5.11, 12.9, 12.10).
      if (montadoRef.current) {
        const erroDoCampo = mensagemDoCampo(erro, 'email')
        if (erroDoCampo) setError(erroDoCampo)
        else setFormError(`${MENSAGEM_PEDIDO_NAO_ENVIADO} ${mensagemDeErro(erro)}`)
      }
      return
    } finally {
      enviandoRef.current = false
      if (montadoRef.current) setEnviando(false)
    }

    // 202: oculta o formulário e confirma com o e-mail informado (5.8).
    if (montadoRef.current) setSentTo(email.trim())
  }

  return (
    <main className="login-page" aria-label="Reset your Choosen password">
      <div className="login-brand">
        <img src={logoMark} alt="" width="90" height="90" />
        <p className="login-brand-name">Choosen</p>
      </div>

      <section className="login-card" aria-labelledby="forgot-title">
        <header className="login-header">
          <h1 id="forgot-title">Forgot your password?</h1>
          <p>Enter the email you use on Choosen and we&apos;ll send you a link to reset it.</p>
        </header>

        {sentTo ? (
          <p className="login-banner login-banner--success" role="status" data-testid="recuperar-sucesso">
            If an account exists for {sentTo}, you&apos;ll receive an email with instructions shortly.
          </p>
        ) : (
          <form className="login-form" noValidate onSubmit={handleSubmit}>
            {formError && (
              <p className="login-banner" role="alert">
                {formError}
              </p>
            )}

            <div className="login-field">
              <label htmlFor="forgot-email">Email</label>
              <div className="login-input">
                <input
                  id="forgot-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={handleChange}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'forgot-email-error' : undefined}
                />
              </div>
              {error && (
                <p className="login-field-error" id="forgot-email-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <button
              className="login-submit"
              type="submit"
              data-testid="recuperar-enviar"
              disabled={enviando}
              aria-busy={enviando}
            >
              {enviando ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="login-signup">
          Remembered it?{' '}
          <button
            className="login-link login-link--strong"
            type="button"
            onClick={onGoToLogin}
            data-testid="voltar-para-login"
          >
            Back to log in
          </button>
        </p>
      </section>
    </main>
  )
}

export default ForgotPassword
