import { useState } from 'react'

const subscriptionPlans = [
  {
    id: 'starter',
    name: 'Inicial',
    description: 'Um jeito simples de começar a escolher com intenção.',
    monthly: 0,
    yearly: 0,
    features: ['5 escolhas de vídeo por dia', '3 listas pessoais', 'Histórico de 7 dias'],
  },
  {
    id: 'focus',
    name: 'Foco',
    description: 'Mais espaço para descobrir e criar hábitos saudáveis.',
    monthly: 8,
    yearly: 6,
    features: ['Escolhas de vídeo ilimitadas', '10 listas pessoais', 'Análises de tempo de tela'],
    recommended: true,
  },
  {
    id: 'unlimited',
    name: 'Ilimitado',
    description: 'A experiência Choosen completa para mentes curiosas.',
    monthly: 15,
    yearly: 12,
    features: ['Tudo do plano Foco', 'Listas pessoais ilimitadas', 'Suporte prioritário'],
  },
]

export default function MyPlan({ onBack }) {
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [currentPlan, setCurrentPlan] = useState('focus')
  const selectedPlan = subscriptionPlans.find((plan) => plan.id === currentPlan)

  return (
    <div className="profile-subpage plan-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Voltar ao perfil</button>

      <header className="plan-heading">
        <div>
          <p className="profile-eyebrow">ASSINATURA</p>
          <h1>Meu plano</h1>
          <p>Escolha o ritmo e o espaço que combinam com o jeito como você quer assistir.</p>
        </div>
        <div className="plan-cycle" role="group" aria-label="Ciclo de cobrança">
          <button type="button" className={billingCycle === 'monthly' ? 'is-selected' : ''} aria-pressed={billingCycle === 'monthly'} onClick={() => setBillingCycle('monthly')}>Mensal</button>
          <button type="button" className={billingCycle === 'yearly' ? 'is-selected' : ''} aria-pressed={billingCycle === 'yearly'} onClick={() => setBillingCycle('yearly')}>Anual <span>Economize 25%</span></button>
        </div>
      </header>

      <section className="plan-current" aria-label="Plano atual">
        <div>
          <span className="plan-current-label">PLANO ATUAL</span>
          <strong>{selectedPlan.name}</strong>
          <p>{selectedPlan.id === 'starter' ? 'Seu plano gratuito está ativo.' : `Sua assinatura ${selectedPlan.name} está ativa.`}</p>
        </div>
        <span className="plan-current-status">Ativo</span>
      </section>

      <div className="plan-grid">
        {subscriptionPlans.map((plan) => {
          const price = billingCycle === 'monthly' ? plan.monthly : plan.yearly
          const isCurrent = currentPlan === plan.id

          return (
            <article className={`plan-card${plan.recommended ? ' plan-card--featured' : ''}${isCurrent ? ' plan-card--current' : ''}`} key={plan.id}>
              {plan.recommended && <span className="plan-badge">Mais escolhido</span>}
              <div className="plan-card-heading"><h2>{plan.name}</h2>{isCurrent && <span className="plan-card-check">✓</span>}</div>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-price"><strong>R$ {price}</strong><span>/ mês</span></div>
              {billingCycle === 'yearly' && plan.monthly > 0 && <p className="plan-billed">Cobrado anualmente em R$ {price * 12}</p>}
              <button className={isCurrent ? 'plan-button plan-button--current' : 'plan-button'} type="button" disabled={isCurrent} onClick={() => setCurrentPlan(plan.id)}>{isCurrent ? 'Plano atual' : `Escolher ${plan.name}`}</button>
              <ul className="plan-features">
                {plan.features.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}
              </ul>
            </article>
          )
        })}
      </div>

      <p className="plan-footnote">Os planos podem ser alterados a qualquer momento. Seu novo acesso começa na hora.</p>
    </div>
  )
}
