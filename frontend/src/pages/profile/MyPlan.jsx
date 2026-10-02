import { useState } from 'react'

const subscriptionPlans = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'A simple way to start choosing with intention.',
    monthly: 0,
    yearly: 0,
    features: ['5 video choices per day', '3 personal lists', '7-day watch history'],
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'More space for discovery and healthier habits.',
    monthly: 8,
    yearly: 6,
    features: ['Unlimited video choices', '10 personal lists', 'Screen-time insights'],
    recommended: true,
  },
  {
    id: 'unlimited',
    name: 'Unlimited',
    description: 'The complete Choosen experience for curious minds.',
    monthly: 15,
    yearly: 12,
    features: ['Everything in Focus', 'Unlimited personal lists', 'Priority support'],
  },
]

export default function MyPlan({ onBack }) {
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [currentPlan, setCurrentPlan] = useState('focus')
  const selectedPlan = subscriptionPlans.find((plan) => plan.id === currentPlan)

  return (
    <div className="profile-subpage plan-page">
      <button className="profile-back-button" type="button" onClick={onBack}>← Back to Profile</button>

      <header className="plan-heading">
        <div>
          <p className="profile-eyebrow">SUBSCRIPTION</p>
          <h1>My plan</h1>
          <p>Choose the pace and space that fits the way you want to watch.</p>
        </div>
        <div className="plan-cycle" role="group" aria-label="Billing cycle">
          <button type="button" className={billingCycle === 'monthly' ? 'is-selected' : ''} aria-pressed={billingCycle === 'monthly'} onClick={() => setBillingCycle('monthly')}>Monthly</button>
          <button type="button" className={billingCycle === 'yearly' ? 'is-selected' : ''} aria-pressed={billingCycle === 'yearly'} onClick={() => setBillingCycle('yearly')}>Yearly <span>Save 25%</span></button>
        </div>
      </header>

      <section className="plan-current" aria-label="Current plan">
        <div>
          <span className="plan-current-label">CURRENT PLAN</span>
          <strong>{selectedPlan.name}</strong>
          <p>{selectedPlan.id === 'starter' ? 'Your free plan is active.' : `Your ${selectedPlan.name} membership is active.`}</p>
        </div>
        <span className="plan-current-status">Active</span>
      </section>

      <div className="plan-grid">
        {subscriptionPlans.map((plan) => {
          const price = billingCycle === 'monthly' ? plan.monthly : plan.yearly
          const isCurrent = currentPlan === plan.id

          return (
            <article className={`plan-card${plan.recommended ? ' plan-card--featured' : ''}${isCurrent ? ' plan-card--current' : ''}`} key={plan.id}>
              {plan.recommended && <span className="plan-badge">Most chosen</span>}
              <div className="plan-card-heading"><h2>{plan.name}</h2>{isCurrent && <span className="plan-card-check">✓</span>}</div>
              <p className="plan-description">{plan.description}</p>
              <div className="plan-price"><strong>${price}</strong><span>/ month</span></div>
              {billingCycle === 'yearly' && plan.monthly > 0 && <p className="plan-billed">Billed yearly at ${price * 12}</p>}
              <button className={isCurrent ? 'plan-button plan-button--current' : 'plan-button'} type="button" disabled={isCurrent} onClick={() => setCurrentPlan(plan.id)}>{isCurrent ? 'Current plan' : `Choose ${plan.name}`}</button>
              <ul className="plan-features">
                {plan.features.map((feature) => <li key={feature}><span aria-hidden="true">✓</span>{feature}</li>)}
              </ul>
            </article>
          )
        })}
      </div>

      <p className="plan-footnote">Plans can be changed at any time. Your new access starts immediately.</p>
    </div>
  )
}
