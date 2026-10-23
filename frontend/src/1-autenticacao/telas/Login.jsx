import { useEffect, useRef, useState } from 'react'
import { isValidEmail, logIn, mensagemDeErro } from '../orquestrador'
import logoMark from '../../assets/finds/icons/logo-mark.svg'
import './Login.css'

const MENSAGEM_CREDENCIAIS_INVALIDAS = 'Incorrect email or password. Please try again.'
const MENSAGEM_CAMPOS_OBRIGATORIOS = 'Email and password are required.'

function validate(email, password) {
  const errors = {}

  if (!email.trim()) errors.email = 'Email is required.'
  else if (!isValidEmail(email)) errors.email = 'Enter a valid email address.'

  // Senha só com espaços conta como vazia (Requisito 3.9).
  if (!password.trim()) errors.password = 'Password is required.'

  return errors
}

function Login({ onLogin, onCreateAccount, onForgotPassword }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // A ref bloqueia um segundo envio no mesmo tick, antes do re-render que
  // desabilita o botão (Requisito 3.11).
  const enviandoRef = useRef(false)
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  function handleEmailChange(event) {
    setEmail(event.target.value)
    setFieldErrors((current) => ({ ...current, email: undefined }))
    setFormError('')
  }

  function handlePasswordChange(event) {
    setPassword(event.target.value)
    setFieldErrors((current) => ({ ...current, password: undefined }))
    setFormError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (enviandoRef.current) return

    // Validação local: com erro, o Orquestrador_Acesso não é acionado (3.9).
    const errors = validate(email, password)
    setFieldErrors(errors)
    if (errors.email || errors.password) {
      const algumVazio = !email.trim() || !password.trim()
      setFormError(algumVazio ? MENSAGEM_CAMPOS_OBRIGATORIOS : '')
      return
    }

    enviandoRef.current = true
    setEnviando(true)
    setFormError('')

    let perfil
    try {
      // E-mail e senha exatamente como digitados (3.1).
      perfil = await logIn(email, password)
    } catch (erro) {
      // Conexão, timeout ou 5xx: mensagem do mapa único (3.10, 12.9, 12.10).
      if (montadoRef.current) {
        setFormError(mensagemDeErro(erro))
        setPassword('')
      }
      return
    } finally {
      enviandoRef.current = false
      if (montadoRef.current) setEnviando(false)
    }

    if (!perfil) {
      // 401/422: mensagem genérica, mantém o e-mail e limpa a senha (3.7).
      if (montadoRef.current) {
        setFormError(MENSAGEM_CREDENCIAIS_INVALIDAS)
        setPassword('')
      }
      return
    }

    // Sessão já salva pelo orquestrador; App abre a Tela_Inicio (3.6).
    onLogin(perfil)
  }

  return (
    <main className="login-page" aria-label="Log in to Choosen">
      <div className="login-brand">
        <img src={logoMark} alt="" width="90" height="90" />
        <p className="login-brand-name">Choosen</p>
      </div>

      <section className="login-card" aria-labelledby="login-title">
        <header className="login-header">
          <h1 id="login-title">Welcome back</h1>
          <p>Log in to keep watching what you choose.</p>
        </header>

        <form className="login-form" noValidate onSubmit={handleSubmit}>
          {formError && (
            <p className="login-banner" role="alert" data-testid="login-erro">
              {formError}
            </p>
          )}

          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <div className="login-input">
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={handleEmailChange}
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
              />
            </div>
            {fieldErrors.email && (
              <p className="login-field-error" id="login-email-error" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className="login-input">
              <input
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={handlePasswordChange}
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
              />
              <button
                className="login-show-password"
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="login-field-error" id="login-password-error" role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="login-forgot-row">
            <button
              className="login-link"
              type="button"
              onClick={onForgotPassword}
              data-testid="ir-para-recuperar-senha"
            >
              Forgot password?
            </button>
          </div>

          <button
            className="login-submit"
            type="submit"
            data-testid="login-entrar"
            disabled={enviando}
            aria-busy={enviando}
          >
            {enviando ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="login-signup">
          Don&apos;t have an account?{' '}
          <button
            className="login-link login-link--strong"
            type="button"
            onClick={onCreateAccount}
            data-testid="ir-para-cadastro"
          >
            Create account
          </button>
        </p>
      </section>
    </main>
  )
}

export default Login
