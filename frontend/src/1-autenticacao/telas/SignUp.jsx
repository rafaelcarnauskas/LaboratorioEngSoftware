import { useEffect, useRef, useState } from 'react'
import { ErroConflito, isEmailTaken, isValidEmail, mensagemDeErro, signUp } from '../orquestrador'
import logoMark from '../../assets/finds/icons/logo-mark.svg'
import './Login.css'

const MIN_PASSWORD_LENGTH = 8

const MENSAGEM_EMAIL_EM_USO = 'An account with this email already exists.'
const MENSAGEM_CAMPO_INVALIDO = 'Some of the information is invalid. Please check your details and try again.'

const emptyForm = { name: '', email: '', password: '', confirmPassword: '' }

// Validações locais (síncronas), com os mesmos textos do mock (Requisito 15.4).
function validateLocal(form) {
  const errors = {}

  if (!form.name.trim()) errors.name = 'Name is required.'

  if (!form.email.trim()) errors.email = 'Email is required.'
  else if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address.'

  if (!form.password) errors.password = 'Password is required.'
  else if (form.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (!form.confirmPassword) errors.confirmPassword = 'Please confirm your password.'
  else if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match.'

  return errors
}

// Validação completa: com o e-mail válido, consulta o Backend para saber se já está
// em uso (4.12). Falha de rede resolve `false`; a decisão final fica com o cadastro (4.13).
async function validate(form) {
  const errors = validateLocal(form)
  if (!errors.email && (await isEmailTaken(form.email))) errors.email = MENSAGEM_EMAIL_EM_USO
  return errors
}

// Campo com rótulo, mensagem de erro ligada por aria-describedby e conteúdo extra
// opcional dentro da caixa (ex.: botão Show/Hide).
function Field({ id, label, error, children, ...inputProps }) {
  const errorId = `${id}-error`

  return (
    <div className="login-field">
      <label htmlFor={id}>{label}</label>
      <div className="login-input">
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...inputProps}
        />
        {children}
      </div>
      {error && (
        <p className="login-field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function SignUp({ onSignUp, onGoToLogin }) {
  const [form, setForm] = useState(emptyForm)
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // A ref bloqueia um segundo envio no mesmo tick, antes do re-render que
  // desabilita o botão (Requisito 12.12).
  const enviandoRef = useRef(false)
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
    setFormError('')
  }

  // Mantém nome e e-mail e limpa só as senhas (4.10, 12.9, 12.10).
  function limparSenhas() {
    setForm((current) => ({ ...current, password: '', confirmPassword: '' }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (enviandoRef.current) return

    // Valores do momento do envio, exatamente como digitados (4.1).
    const dados = form

    enviandoRef.current = true
    setEnviando(true)
    setFormError('')

    let perfil
    try {
      const errors = await validate(dados)
      if (!montadoRef.current) return
      setFieldErrors(errors)
      // Com erro de validação, o cadastro não é enviado.
      if (Object.keys(errors).length > 0) return

      // Sem o campo de confirmação de senha (4.1).
      perfil = await signUp({ name: dados.name, email: dados.email, password: dados.password })
    } catch (erro) {
      if (!montadoRef.current) return
      if (erro instanceof ErroConflito) {
        // 409: e-mail já em uso, no campo e no aviso geral (4.10, 15.5).
        setFieldErrors((current) => ({ ...current, email: MENSAGEM_EMAIL_EM_USO }))
        setFormError(MENSAGEM_EMAIL_EM_USO)
        return
      }
      // Conexão, timeout ou 5xx: mensagem do mapa único (4.11, 12.9, 12.10).
      setFormError(mensagemDeErro(erro))
      limparSenhas()
      return
    } finally {
      enviandoRef.current = false
      if (montadoRef.current) setEnviando(false)
    }

    if (!perfil) {
      // 422: o Backend recusou algum campo (4.10).
      if (montadoRef.current) setFormError(MENSAGEM_CAMPO_INVALIDO)
      return
    }

    // Sessão já salva pelo orquestrador; login automático abre a Tela_Inicio (4.6).
    onSignUp(perfil)
  }

  return (
    <main className="login-page" aria-label="Create your Choosen account">
      <div className="login-brand">
        <img src={logoMark} alt="" width="90" height="90" />
        <p className="login-brand-name">Choosen</p>
      </div>

      <section className="login-card" aria-labelledby="signup-title">
        <header className="login-header">
          <h1 id="signup-title">Create your account</h1>
          <p>Choose what you watch, with communities you care about.</p>
        </header>

        <form className="login-form" noValidate onSubmit={handleSubmit}>
          {formError && (
            <p className="login-banner" role="alert" data-testid="cadastro-erro">
              {formError}
            </p>
          )}

          <Field
            id="signup-name"
            name="name"
            label="Name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={form.name}
            onChange={handleChange}
            error={fieldErrors.name}
          />

          <Field
            id="signup-email"
            name="email"
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={form.email}
            onChange={handleChange}
            error={fieldErrors.email}
          />

          <Field
            id="signup-password"
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
            value={form.password}
            onChange={handleChange}
            error={fieldErrors.password}
          >
            <button
              className="login-show-password"
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-pressed={showPassword}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </Field>

          <Field
            id="signup-confirm-password"
            name="confirmPassword"
            label="Confirm password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repeat your password"
            value={form.confirmPassword}
            onChange={handleChange}
            error={fieldErrors.confirmPassword}
          />

          <button
            className="login-submit"
            type="submit"
            data-testid="cadastro-criar"
            disabled={enviando}
            aria-busy={enviando}
          >
            {enviando ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="login-signup">
          Already have an account?{' '}
          <button
            className="login-link login-link--strong"
            type="button"
            onClick={onGoToLogin}
            data-testid="ir-para-login"
          >
            Log in
          </button>
        </p>
      </section>
    </main>
  )
}

export default SignUp
