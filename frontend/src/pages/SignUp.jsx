import { useState } from 'react'
import { isEmailTaken, isValidEmail, signUp } from '../controllers/authController'
import logoMark from '../assets/reels/icons/logo-mark.svg'
import './Login.css'

const MIN_PASSWORD_LENGTH = 8

const emptyForm = { name: '', email: '', password: '', confirmPassword: '' }

function validate(form) {
  const errors = {}

  if (!form.name.trim()) errors.name = 'Name is required.'

  if (!form.email.trim()) errors.email = 'Email is required.'
  else if (!isValidEmail(form.email)) errors.email = 'Enter a valid email address.'
  else if (isEmailTaken(form.email)) errors.email = 'An account with this email already exists.'

  if (!form.password) errors.password = 'Password is required.'
  else if (form.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (!form.confirmPassword) errors.confirmPassword = 'Please confirm your password.'
  else if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match.'

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

  function handleChange(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
    setFormError('')
  }

  function handleSubmit(event) {
    event.preventDefault()

    const errors = validate(form)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const user = signUp(form)
    if (!user) {
      setFormError("We couldn't save your account. Please try again.")
      return
    }

    onSignUp(user)
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

          <button className="login-submit" type="submit" data-testid="cadastro-criar">
            Create account
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
