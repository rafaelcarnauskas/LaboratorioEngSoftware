import { useState } from 'react'

export function ProfileAvatar({ profile, large = false }) {
  const initial = profile.name.trim().charAt(0).toUpperCase() || 'V'

  return profile.photo ? (
    <img
      className={`profile-avatar${large ? ' profile-avatar--large' : ''}`}
      src={profile.photo}
      alt={`Foto de perfil de ${profile.name}`}
    />
  ) : (
    <div className={`profile-avatar${large ? ' profile-avatar--large' : ''}`} aria-hidden="true">
      {initial}
    </div>
  )
}

export default function EditProfile({ profile, onSave, onBack }) {
  const [form, setForm] = useState(profile)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }))
    setSaved(false)
    setError('')
  }

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setForm((current) => ({ ...current, photo: String(reader.result) }))
      setSaved(false)
      setError('')
    }
    reader.onerror = () => setError('Não foi possível carregar a foto. Tente novamente.')
    reader.readAsDataURL(file)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const name = form.name.trim()
    const username = form.username.trim()

    if (!name || !username) {
      setError('Preencha o nome e o nome de usuário.')
      return
    }

    onSave({ ...form, name, username, description: form.description.trim() })
    setSaved(true)
    setError('')
  }

  return (
    <div className="profile-subpage edit-profile-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>
      <div className="edit-profile-heading">
        <div>
          <p className="profile-eyebrow">PERFIL</p>
          <h1>Editar perfil</h1>
          <p>Atualize sua foto, seu nome de usuário e a descrição que aparece no seu perfil.</p>
        </div>
        <ProfileAvatar profile={form} large />
      </div>

      <form className="edit-profile-form" onSubmit={handleSubmit}>
        <section className="edit-profile-card" aria-labelledby="edit-profile-photo-title">
          <div>
            <h2 id="edit-profile-photo-title">Foto do perfil</h2>
            <p>Escolha uma imagem para personalizar seu perfil.</p>
          </div>
          <label className="profile-upload-button">
            <span>Trocar foto</span>
            <input type="file" accept="image/*" onChange={handlePhotoChange} />
          </label>
        </section>

        <section className="edit-profile-fields" aria-label="Informações do perfil">
          <label>
            <span>Nome</span>
            <input type="text" value={form.name} onChange={updateField('name')} maxLength={60} required />
          </label>
          <label>
            <span>Nome de usuário</span>
            <input type="text" value={form.username} onChange={updateField('username')} maxLength={30} placeholder="ex.: victor" required />
            <small>Seu nome de usuário será exibido como @{form.username || 'usuario'}.</small>
          </label>
          <label>
            <span>Descrição do perfil</span>
            <textarea value={form.description} onChange={updateField('description')} maxLength={160} rows={4} placeholder="Conte um pouco sobre você" />
            <small>{form.description.length}/160 caracteres</small>
          </label>
        </section>

        {error && <p className="edit-profile-message edit-profile-message--error" role="alert">{error}</p>}
        {saved && <p className="edit-profile-message edit-profile-message--success" role="status">Perfil atualizado com sucesso.</p>}

        <div className="edit-profile-actions">
          <button className="edit-profile-cancel" type="button" onClick={onBack}>Cancelar</button>
          <button className="edit-profile-save" type="submit">Salvar alterações</button>
        </div>
      </form>
    </div>
  )
}
