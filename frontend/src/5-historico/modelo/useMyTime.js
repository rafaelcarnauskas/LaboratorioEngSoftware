import { useEffect, useState } from 'react'
import { apiAtiva, carregarPreferencias, erroApi, salvarPreferencias } from '../servico'

const storageKey = 'choosen.mytime.v1'
const reminderKeys = ['bedtime', 'screenTime', 'weekly']

export const limitOptions = [30, 45, 60, 90, 120]

const defaults = {
  dailyLimit: 60,
  reminders: { bedtime: true, screenTime: true, weekly: false },
}

export function isValidSettings(settings) {
  return (
    settings !== null && typeof settings === 'object' &&
    limitOptions.includes(settings.dailyLimit) &&
    settings.reminders !== null && typeof settings.reminders === 'object' &&
    reminderKeys.every((key) => typeof settings.reminders[key] === 'boolean') &&
    Object.keys(settings.reminders).length === 3
  )
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(storageKey)
    if (saved === null) return { settings: defaults, storageError: '' }

    const settings = JSON.parse(saved)
    if (!isValidSettings(settings)) throw new Error('Invalid saved settings')

    return { settings, storageError: '' }
  } catch {
    return {
      settings: defaults,
      storageError: 'Não foi possível carregar suas preferências de tempo. As alterações continuarão disponíveis nesta sessão.',
    }
  }
}

export default function useMyTime(usuario) {
  const [state, setState] = useState(loadSettings)
  const usarApi = apiAtiva && Boolean(usuario)

  useEffect(() => {
    if (!usarApi) return
    carregarPreferencias(usuario)
      .then((settings) => setState({ settings, storageError: '' }))
      .catch(() => setState((current) => ({ ...current, storageError: erroApi })))
  }, [usarApi, usuario])

  function updateSettings(settings) {
    if (usarApi) {
      salvarPreferencias(usuario, settings).catch(() => setState((current) => ({ ...current, storageError: erroApi })))
    }
    let storageError = ''
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings))
    } catch {
      storageError = 'Seu navegador não conseguiu salvar estas preferências. Elas continuarão disponíveis nesta sessão.'
    }
    setState({ settings, storageError })
  }

  // Nothing the application writes may fail its own read validation, so a limit
  // outside limitOptions and an unknown reminder key are ignored in silence.
  function setDailyLimit(dailyLimit) {
    if (!limitOptions.includes(dailyLimit)) return
    updateSettings({ ...state.settings, dailyLimit })
  }

  function toggleReminder(key) {
    if (!reminderKeys.includes(key)) return
    updateSettings({
      ...state.settings,
      reminders: { ...state.settings.reminders, [key]: !state.settings.reminders[key] },
    })
  }

  return { ...state, setDailyLimit, toggleReminder, updateSettings }
}
