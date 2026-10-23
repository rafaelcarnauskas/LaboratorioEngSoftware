import { useEffect, useRef, useState } from 'react'
import {
  atualizarPerfil,
  ErroConflito,
  ErroValidacao,
  mensagemDeErro,
  mensagemDoCampo,
} from '../orquestrador'

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

// Regras do Requisito 1 (as mesmas do Servico_Usuario), checadas antes do envio.
const NOME_MAXIMO = 60
const DESCRICAO_MAXIMA = 160
const FOTO_MAXIMA_BYTES = 2_097_152 // 2 MB decodificados
const PADRAO_USERNAME = /^[A-Za-z0-9._]{1,30}$/
const PADRAO_PREFIXO_FOTO = /^data:image\/[A-Za-z0-9.+-]+;base64,/

const MENSAGEM_CAMPOS_OBRIGATORIOS = 'Preencha o nome e o nome de usuário.'
const MENSAGEM_NOME_LONGO = 'O nome deve ter no máximo 60 caracteres.'
const MENSAGEM_USERNAME_INVALIDO =
  'Use de 1 a 30 caracteres: letras, números, ponto (.) ou sublinhado (_).'
const MENSAGEM_USERNAME_EM_USO = 'Este nome de usuário já está em uso.'
const MENSAGEM_DESCRICAO_LONGA = 'A descrição deve ter no máximo 160 caracteres.'
const MENSAGEM_FOTO_INVALIDA = 'Selecione um arquivo de imagem válido.'
const MENSAGEM_FOTO_GRANDE = 'A foto deve ter no máximo 2 MB.'
const MENSAGEM_FOTO_FALHA_LEITURA = 'Não foi possível carregar a foto. Tente novamente.'
const MENSAGEM_SUCESSO = 'Perfil atualizado com sucesso.'

const CAMPOS_API = ['name', 'username', 'description', 'photo']

const ID_ERRO_FORM = 'edit-profile-error'
const ID_CAMPO = {
  name: 'edit-profile-name',
  username: 'edit-profile-username',
  description: 'edit-profile-description',
  photo: 'edit-profile-photo',
}

// Mesmo espaçamento do rótulo em App.css, agora que dica e erro ficam fora do
// <label> (para não entrarem no nome acessível do campo).
const ESTILO_CAMPO = { display: 'flex', flexDirection: 'column', gap: 6 }

const texto = (valor) => (typeof valor === 'string' ? valor : '')

/** Valores do formulário a partir de um Perfil_Publico. */
function paraFormulario(perfil) {
  return {
    name: texto(perfil?.name),
    username: texto(perfil?.username),
    description: texto(perfil?.description),
    photo: texto(perfil?.photo),
  }
}

/** Caracteres contados como no Backend (code points, não unidades UTF-16). */
function contarCaracteres(valor) {
  return Array.from(valor).length
}

/** Bytes decodificados do trecho base64 de uma data URL. */
function bytesDecodificados(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

function validarFoto(photo) {
  if (photo === '') return null
  if (!PADRAO_PREFIXO_FOTO.test(photo)) return MENSAGEM_FOTO_INVALIDA
  if (bytesDecodificados(photo) > FOTO_MAXIMA_BYTES) return MENSAGEM_FOTO_GRANDE
  return null
}

/**
 * Validação local sobre os dados que serão enviados (já sem espaços nas
 * extremidades). Com qualquer erro nenhuma requisição é feita.
 */
function validate({ name, username, description, photo }) {
  const fieldErrors = {}
  let formError = ''

  if (name === '' || username === '') {
    formError = MENSAGEM_CAMPOS_OBRIGATORIOS
    if (name === '') fieldErrors.name = true
    if (username === '') fieldErrors.username = true
  }

  if (contarCaracteres(name) > NOME_MAXIMO) fieldErrors.name = MENSAGEM_NOME_LONGO
  if (username !== '' && !PADRAO_USERNAME.test(username)) {
    fieldErrors.username = MENSAGEM_USERNAME_INVALIDO
  }
  if (contarCaracteres(description) > DESCRICAO_MAXIMA) {
    fieldErrors.description = MENSAGEM_DESCRICAO_LONGA
  }
  const erroFoto = validarFoto(photo)
  if (erroFoto) fieldErrors.photo = erroFoto

  return { fieldErrors, formError }
}

export default function EditProfile({ profile, onSaved, onBack }) {
  const [form, setForm] = useState(() => paraFormulario(profile))
  // Valor `true` marca o campo como inválido sem mensagem própria (a mensagem
  // fica no erro do formulário); string é a mensagem exibida sob o campo.
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
  const [enviando, setEnviando] = useState(false)

  // A ref bloqueia um segundo envio no mesmo tick, antes do re-render que
  // desabilita o botão (7.10, 12.12).
  const enviandoRef = useRef(false)
  const montadoRef = useRef(false)

  useEffect(() => {
    montadoRef.current = true
    return () => {
      montadoRef.current = false
    }
  }, [])

  function limparAvisos(campo) {
    setFieldErrors((current) => ({ ...current, [campo]: undefined }))
    setFormError('')
    setSaved(false)
  }

  const updateField = (field) => (event) => {
    const { value } = event.target
    setForm((current) => ({ ...current, [field]: value }))
    limparAvisos(field)
  }

  const handlePhotoChange = (event) => {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return

    limparAvisos('photo')

    if (!file.type.startsWith('image/')) {
      setFieldErrors((current) => ({ ...current, photo: MENSAGEM_FOTO_INVALIDA }))
      input.value = ''
      return
    }

    if (file.size > FOTO_MAXIMA_BYTES) {
      setFieldErrors((current) => ({ ...current, photo: MENSAGEM_FOTO_GRANDE }))
      input.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (!montadoRef.current) return
      const photo = String(reader.result)
      const erroFoto = validarFoto(photo)
      if (erroFoto) {
        setFieldErrors((current) => ({ ...current, photo: erroFoto }))
        input.value = ''
        return
      }
      setForm((current) => ({ ...current, photo }))
      limparAvisos('photo')
    }
    reader.onerror = () => {
      if (!montadoRef.current) return
      setFieldErrors((current) => ({ ...current, photo: MENSAGEM_FOTO_FALHA_LEITURA }))
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (enviandoRef.current) return

    setSaved(false)
    setFormError('')

    // Os quatro campos vão sempre, inclusive os não alterados (7.1).
    const dados = {
      name: form.name.trim(),
      username: form.username.trim(),
      description: form.description.trim(),
      photo: form.photo,
    }

    const validacao = validate(dados)
    setFieldErrors(validacao.fieldErrors)
    setFormError(validacao.formError)
    if (validacao.formError || Object.keys(validacao.fieldErrors).length > 0) return

    enviandoRef.current = true
    setEnviando(true)

    try {
      const perfil = await atualizarPerfil(dados)
      if (montadoRef.current) {
        setForm(paraFormulario(perfil))
        setFieldErrors({})
        setSaved(true)
      }
      // A Tela_Perfil passa a exibir o Perfil_Publico devolvido (7.6).
      onSaved?.(perfil)
    } catch (erro) {
      if (montadoRef.current) mostrarErro(erro)
    } finally {
      // Reabilita o envio se a tela continua exibida (12.13).
      enviandoRef.current = false
      if (montadoRef.current) setEnviando(false)
    }
  }

  // Em qualquer erro os valores digitados ficam no formulário (7.7).
  // 422: mensagem do Backend em cada campo; 409: username em uso no campo;
  // conexão/servidor: mapa único (12.9, 12.10). Sessão inválida é tratada pelo
  // ouvinte global do App, que leva à Tela_Login.
  function mostrarErro(erro) {
    if (erro instanceof ErroConflito && erro.code === 'username_em_uso') {
      setFieldErrors({ username: mensagemDeErro(erro, MENSAGEM_USERNAME_EM_USO) })
      return
    }

    if (erro instanceof ErroValidacao) {
      const erros = {}
      for (const campo of CAMPOS_API) {
        const mensagem = mensagemDoCampo(erro, campo)
        if (mensagem) erros[campo] = mensagem
      }
      if (Object.keys(erros).length > 0) {
        setFieldErrors(erros)
        return
      }
    }

    setFormError(mensagemDeErro(erro))
  }

  // aria-describedby do campo: dica, mensagem própria e/ou erro do formulário.
  function descritores(campo, dicaId) {
    const erroCampo = fieldErrors[campo]
    const ids = [
      dicaId,
      typeof erroCampo === 'string' && `${ID_CAMPO[campo]}-error`,
      erroCampo === true && formError && ID_ERRO_FORM,
    ].filter(Boolean)
    return ids.length > 0 ? ids.join(' ') : undefined
  }

  function mensagemCampo(campo) {
    const erroCampo = fieldErrors[campo]
    if (typeof erroCampo !== 'string') return null
    return (
      <p
        className="edit-profile-message edit-profile-message--error"
        id={`${ID_CAMPO[campo]}-error`}
        role="alert"
      >
        {erroCampo}
      </p>
    )
  }

  const idDicaUsername = `${ID_CAMPO.username}-hint`
  const idDicaDescricao = `${ID_CAMPO.description}-hint`

  return (
    <div className="profile-subpage edit-profile-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>
      <div className="edit-profile-heading">
        <div>
          <p className="profile-eyebrow">PERFIL</p>
          <h1 id="edit-profile-title">Editar perfil</h1>
          <p>Atualize sua foto, seu nome de usuário e a descrição que aparece no seu perfil.</p>
        </div>
        <ProfileAvatar profile={form} large />
      </div>

      <form
        className="edit-profile-form"
        noValidate
        onSubmit={handleSubmit}
        aria-labelledby="edit-profile-title"
      >
        <section className="edit-profile-card" aria-labelledby="edit-profile-photo-title">
          <div>
            <h2 id="edit-profile-photo-title">Foto do perfil</h2>
            <p>Escolha uma imagem para personalizar seu perfil.</p>
            {mensagemCampo('photo')}
          </div>
          <label className="profile-upload-button" htmlFor={ID_CAMPO.photo}>
            <span>Trocar foto</span>
            <input
              id={ID_CAMPO.photo}
              name="photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              aria-invalid={Boolean(fieldErrors.photo)}
              aria-describedby={descritores('photo')}
            />
          </label>
        </section>

        <section className="edit-profile-fields" aria-label="Informações do perfil">
          <div style={ESTILO_CAMPO}>
            <label htmlFor={ID_CAMPO.name}>
              <span>Nome</span>
              <input
                id={ID_CAMPO.name}
                name="name"
                type="text"
                value={form.name}
                onChange={updateField('name')}
                maxLength={NOME_MAXIMO}
                autoComplete="name"
                required
                aria-invalid={Boolean(fieldErrors.name)}
                aria-describedby={descritores('name')}
              />
            </label>
            {mensagemCampo('name')}
          </div>
          <div style={ESTILO_CAMPO}>
            <label htmlFor={ID_CAMPO.username}>
              <span>Nome de usuário</span>
              <input
                id={ID_CAMPO.username}
                name="username"
                type="text"
                value={form.username}
                onChange={updateField('username')}
                maxLength={30}
                placeholder="ex.: victor"
                autoComplete="username"
                required
                aria-invalid={Boolean(fieldErrors.username)}
                aria-describedby={descritores('username', idDicaUsername)}
              />
            </label>
            <small id={idDicaUsername}>Seu nome de usuário será exibido como @{form.username || 'usuario'}.</small>
            {mensagemCampo('username')}
          </div>
          <div style={ESTILO_CAMPO}>
            <label htmlFor={ID_CAMPO.description}>
              <span>Descrição do perfil</span>
              <textarea
                id={ID_CAMPO.description}
                name="description"
                value={form.description}
                onChange={updateField('description')}
                maxLength={DESCRICAO_MAXIMA}
                rows={4}
                placeholder="Conte um pouco sobre você"
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={descritores('description', idDicaDescricao)}
              />
            </label>
            <small id={idDicaDescricao}>{contarCaracteres(form.description)}/160 caracteres</small>
            {mensagemCampo('description')}
          </div>
        </section>

        {formError && (
          <p
            className="edit-profile-message edit-profile-message--error"
            id={ID_ERRO_FORM}
            role="alert"
            data-testid="editar-perfil-erro"
          >
            {formError}
          </p>
        )}
        {saved && (
          <p
            className="edit-profile-message edit-profile-message--success"
            role="status"
            data-testid="editar-perfil-sucesso"
          >
            {MENSAGEM_SUCESSO}
          </p>
        )}

        <div className="edit-profile-actions">
          <button className="edit-profile-cancel" type="button" onClick={onBack}>Cancelar</button>
          <button
            className="edit-profile-save"
            type="submit"
            data-testid="editar-perfil-enviar"
            disabled={enviando}
            aria-busy={enviando}
          >
            {enviando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
