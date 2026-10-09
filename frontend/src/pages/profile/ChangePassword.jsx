import { useState } from 'react'

export default function ChangePassword({ onBack }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  function handleSubmit(event) {
    event.preventDefault()

    if (newPassword.length < 8) {
      setError('A nova senha deve ter pelo menos 8 caracteres.')
      setSaved(false)
      return
    }

    if (newPassword !== confirmation) {
      setError('A confirmação da senha não confere.')
      setSaved(false)
      return
    }

    setError('')
    setSaved(true)
    setNewPassword('')
    setConfirmation('')
  }

  function updatePassword(setter) {
    return (event) => {
      setter(event.target.value)
      setError('')
      setSaved(false)
    }
  }

  return (
    <div className="profile-subpage change-password-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>

      <header className="change-password-heading">
        <p className="profile-eyebrow">CONTA</p>
        <h1>Alterar senha</h1>
        <p>Crie uma nova senha para manter sua conta protegida.</p>
      </header>

      <form className="change-password-form" onSubmit={handleSubmit}>
        <div className="change-password-fields">
          <label>
            <span>Nova senha</span>
            <input
              type="password"
              value={newPassword}
              onChange={updatePassword(setNewPassword)}
              minLength={8}
              autoComplete="new-password"
              required
            />
            <small>Use pelo menos 8 caracteres.</small>
          </label>
          <label>
            <span>Confirmar nova senha</span>
            <input
              type="password"
              value={confirmation}
              onChange={updatePassword(setConfirmation)}
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>
        </div>

        {error && <p className="edit-profile-message edit-profile-message--error" role="alert">{error}</p>}
        {saved && <p className="edit-profile-message edit-profile-message--success" role="status">Senha alterada com sucesso.</p>}

        <div className="edit-profile-actions">
          <button className="edit-profile-cancel" type="button" onClick={onBack}>Cancelar</button>
          <button className="edit-profile-save" type="submit">Criar nova senha</button>
        </div>
      </form>
    </div>
  )
}
