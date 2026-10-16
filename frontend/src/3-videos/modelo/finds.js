// Dados de exemplo dos finds. Quando houver backend, esta lista
// passa a vir da API (ex.: fetch('/api/videos?categoria=sports')).
//
// `title` é o rótulo curto exibido no histórico e no histórico recente.
// `nicheId` aponta para um nicho declarado pela comunidade em `communityId`
// (ver 2-comunidades/modelo/communities.js); a relação é um invariante dos dados mock.
import bmpoliuspAvatar from '../../assets/finds/avatars/bmpoliusp.png'
import sosomarianoAvatar from '../../assets/finds/avatars/sosomariano.png'
import rafaelcarnauskasAvatar from '../../assets/finds/avatars/rafaelcarnauskas.png'
import mendesvictorAvatar from '../../assets/finds/avatars/mendesvictor.png'
import marcolinocarlosAvatar from '../../assets/finds/avatars/marcolinocarlos.png'
import terylucasAvatar from '../../assets/finds/avatars/terylucas.png'
import lauramatthewsAvatar from '../../assets/finds/avatars/lauramatthews.png'
import harryprescottAvatar from '../../assets/finds/avatars/harryprescott.png'
import ednamanzAvatar from '../../assets/finds/avatars/ednamanz.png'
import christinasterlingAvatar from '../../assets/finds/avatars/christinasterling.png'
import sports1 from '../../assets/finds/posts/sports-1.png'
import sports2 from '../../assets/finds/posts/sports-2.png'
import sports3 from '../../assets/finds/posts/sports-3.png'
import cute1 from '../../assets/finds/posts/cute-1.png'
import cute2 from '../../assets/finds/posts/cute-2.png'
import cute3 from '../../assets/finds/posts/cute-3.png'

export const finds = [
  {
    id: 'sports-1',
    title: 'Final do basquete masculino — Interusp 2026',
    category: 'sports',
    communityId: 'poli-usp',
    nicheId: 'basquete',
    author: 'BmPoliUsp',
    avatar: bmpoliuspAvatar,
    image: sports1,
    caption: 'Final do basquete masculino no interusp 2026, vitória da Poli contra',
    likes: 1069,
    commentCount: 100,
    postedAt: '1 hour ago',
  },
  {
    id: 'sports-2',
    title: 'Treino intenso de judô',
    category: 'sports',
    communityId: 'judo-brasil',
    nicheId: 'treino',
    author: 'SoSoMariano',
    avatar: sosomarianoAvatar,
    image: sports2,
    caption: 'Treino intenso de judô hoje!',
    likes: 1069,
    commentCount: 100,
    postedAt: '1 hour ago',
  },
  {
    id: 'sports-3',
    title: 'Final do basquete masculino — Interusp 2025',
    category: 'sports',
    communityId: 'poli-usp',
    nicheId: 'basquete',
    author: 'BmPoliUsp',
    avatar: bmpoliuspAvatar,
    image: sports3,
    caption: 'Final do basquete masculino no interusp 2025, vitória da Poli contra',
    likes: 1069,
    commentCount: 100,
    postedAt: '1 hour ago',
  },
  {
    id: 'cute-1',
    title: 'Aniversário da princesinha',
    category: 'cute',
    communityId: 'vida-de-pet',
    nicheId: 'festas',
    author: 'RafaelCarnauskas',
    avatar: rafaelcarnauskasAvatar,
    image: cute1,
    caption: 'Aniversário da minha princesinha',
    likes: 1069,
    commentCount: 100,
    postedAt: '1 hour ago',
  },
  {
    id: 'cute-2',
    title: 'Aurora no descanso da tarde',
    category: 'cute',
    communityId: 'vida-de-pet',
    nicheId: 'rotina',
    author: 'mendesvictor',
    avatar: mendesvictorAvatar,
    image: cute2,
    caption: 'Aurora no seu descanso da tarde!',
    likes: 1069,
    commentCount: 100,
    postedAt: '1 hour ago',
  },
  {
    id: 'cute-3',
    title: 'Dia de petshop',
    category: 'cute',
    communityId: 'vida-de-pet',
    nicheId: 'cuidados',
    author: 'MarcolinoCarlos',
    avatar: marcolinocarlosAvatar,
    image: cute3,
    caption: 'Dia de petshop',
    likes: 1069,
    commentCount: 100,
    postedAt: '1 hour ago',
  },
]

export const suggestions = [
  { username: 'terylucas', avatar: terylucasAvatar },
  { username: 'lauramatthews', avatar: lauramatthewsAvatar },
  { username: 'harryprescott', avatar: harryprescottAvatar },
  { username: 'ednamanz', avatar: ednamanzAvatar },
  { username: 'christinasterling', avatar: christinasterlingAvatar },
]
