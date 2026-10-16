import { useState } from 'react'
import { requestPasswordReset } from '../controllers/authController'
import logoMark from '../assets/reels/icons/logo-mark.svg'
import './Login.css'

// "Esqueci a senha": pede o e-mail e confirma o envio das instruções. Sem backend
// nenhum e-mail sai de fato; a tela já fica pronta para quando a API existir.
function ForgotPassword({ onGoToLogin }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState('')

  function handleChange(event) {
    setEmail(event.target.value)
    setError('')
  }

  function handleSubmit(event) {
    event.preventDefault()

    if (!email.trim()) {
      setError('Email is required.')
      return
    }
    if (!requestPasswordReset(email)) {
      setError('Enter a valid email address.')
      return
    }

    setSentTo(email.trim())
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

            <button className="login-submit" type="submit" data-testid="recuperar-enviar">
              Send reset link
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
