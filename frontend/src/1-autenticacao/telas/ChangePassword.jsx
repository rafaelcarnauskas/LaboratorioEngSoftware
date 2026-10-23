import { useEffect, useRef, useState } from 'react'
import {
  changePassword,
  ErroConexao,
  ErroRequisicao,
  ErroServidor,
  ErroValidacao,
  mensagemDeErro,
  mensagemDoCampo,
} from '../orquestrador'

const SENHA_MINIMA = 8
const SENHA_MAXIMA = 128

const MENSAGEM_SENHA_ATUAL_VAZIA = 'Informe a senha atual.'
const MENSAGEM_SENHA_CURTA = 'A nova senha deve ter pelo menos 8 caracteres.'
const MENSAGEM_SENHA_LONGA = 'A nova senha deve ter no máximo 128 caracteres.'
const MENSAGEM_CONFIRMACAO = 'A confirmação da senha não confere.'
const MENSAGEM_SUCESSO = 'Senha alterada com sucesso.'

const CAMPOS_VAZIOS = { currentPassword: '', newPassword: '', confirmation: '' }

/**
 * Validação local (8.2, 8.3): com qualquer erro, nenhuma requisição é enviada.
 * A confirmação é comparada caractere a caractere, diferenciando maiúsculas.
 */
function validate({ currentPassword, newPassword, confirmation }) {
  const errors = {}

  if (currentPassword === '') errors.currentPassword = MENSAGEM_SENHA_ATUAL_VAZIA

  if (newPassword.length < SENHA_MINIMA) errors.newPassword = MENSAGEM_SENHA_CURTA
  else if (newPassword.length > SENHA_MAXIMA) errors.newPassword = MENSAGEM_SENHA_LONGA

  if (confirmation !== newPassword) errors.confirmation = MENSAGEM_CONFIRMACAO

  return errors
}

// Mesmo espaçamento do rótulo em App.css, agora que dica e erro ficam fora do
// <label> (para não entrarem no nome acessível do campo).
const ESTILO_CAMPO = { display: 'flex', flexDirection: 'column', gap: 6 }

const CAMPOS = [
  {
    name: 'currentPassword',
    id: 'change-current-password',
    label: 'Senha atual',
    autoComplete: 'current-password',
  },
  {
    name: 'newPassword',
    id: 'change-new-password',
    label: 'Nova senha',
    autoComplete: 'new-password',
    hint: 'Use de 8 a 128 caracteres.',
  },
  {
    name: 'confirmation',
    id: 'change-confirm-password',
    label: 'Confirmar nova senha',
    autoComplete: 'new-password',
  },
]

export default function ChangePassword({ onBack }) {
  const [values, setValues] = useState(CAMPOS_VAZIOS)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)
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
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setFieldErrors((current) => ({ ...current, [name]: undefined }))
    setFormError('')
    setSaved(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (enviandoRef.current) return

    setSaved(false)
    setFormError('')

    const errors = validate(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    enviandoRef.current = true
    setEnviando(true)

    try {
      await changePassword(values.currentPassword, values.newPassword)
      // 204: a sessão atual continua válida; as demais foram revogadas (8.5, 8.9).
      if (montadoRef.current) {
        setValues(CAMPOS_VAZIOS)
        setFieldErrors({})
        setSaved(true)
      }
    } catch (erro) {
      if (montadoRef.current) mostrarErro(erro)
    } finally {
      // Reabilita o envio se a tela continua exibida (12.13).
      enviandoRef.current = false
      if (montadoRef.current) setEnviando(false)
    }
  }

  // 400/422: mensagem do Backend, usuário segue na tela com a sessão (8.10).
  // Conexão/servidor: mensagens do mapa único (12.9, 12.10). Sessão inválida é
  // tratada pelo ouvinte global do App, que leva à Tela_Login.
  function mostrarErro(erro) {
    if (erro instanceof ErroRequisicao && erro.code === 'senha_atual_incorreta') {
      setValues((current) => ({ ...current, currentPassword: '' }))
      setFieldErrors({ currentPassword: mensagemDeErro(erro) })
      return
    }

    if (erro instanceof ErroValidacao) {
      const mensagemCampo = mensagemDoCampo(erro, 'newPassword')
      if (mensagemCampo) {
        setFieldErrors({ newPassword: mensagemCampo })
        return
      }
    }

    if (erro instanceof ErroConexao || erro instanceof ErroServidor) {
      // Campos de senha não são mantidos após falha de comunicação (12.10).
      setValues(CAMPOS_VAZIOS)
    }

    setFormError(mensagemDeErro(erro))
  }

  return (
    <div className="profile-subpage change-password-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>

      <header className="change-password-heading">
        <p className="profile-eyebrow">CONTA</p>
        <h1 id="change-password-title">Alterar senha</h1>
        <p>Crie uma nova senha para manter sua conta protegida.</p>
      </header>

      <form
        className="change-password-form"
        noValidate
        onSubmit={handleSubmit}
        aria-labelledby="change-password-title"
      >
        <div className="change-password-fields">
          {CAMPOS.map((campo) => {
            const erroCampo = fieldErrors[campo.name]
            const erroId = `${campo.id}-error`
            const dicaId = `${campo.id}-hint`
            const descritores = [campo.hint && dicaId, erroCampo && erroId].filter(Boolean)

            return (
              <div key={campo.name} style={ESTILO_CAMPO}>
                <label htmlFor={campo.id}>
                  <span>{campo.label}</span>
                  <input
                    id={campo.id}
                    name={campo.name}
                    type="password"
                    value={values[campo.name]}
                    onChange={handleChange}
                    autoComplete={campo.autoComplete}
                    aria-invalid={Boolean(erroCampo)}
                    aria-describedby={descritores.length > 0 ? descritores.join(' ') : undefined}
                  />
                </label>
                {campo.hint && (
                  <small id={dicaId}>{campo.hint}</small>
                )}
                {erroCampo && (
                  <p
                    className="edit-profile-message edit-profile-message--error"
                    id={erroId}
                    role="alert"
                  >
                    {erroCampo}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {formError && (
          <p
            className="edit-profile-message edit-profile-message--error"
            role="alert"
            data-testid="alterar-senha-erro"
          >
            {formError}
          </p>
        )}
        {saved && (
          <p
            className="edit-profile-message edit-profile-message--success"
            role="status"
            data-testid="alterar-senha-sucesso"
          >
            {MENSAGEM_SUCESSO}
          </p>
        )}

        <div className="edit-profile-actions">
          <button className="edit-profile-cancel" type="button" onClick={onBack}>Cancelar</button>
          <button
            className="edit-profile-save"
            type="submit"
            data-testid="alterar-senha-enviar"
            disabled={enviando}
            aria-busy={enviando}
          >
            {enviando ? 'Alterando…' : 'Criar nova senha'}
          </button>
        </div>
      </form>
    </div>
  )
}
