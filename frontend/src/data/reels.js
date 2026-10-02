// Dados de exemplo dos reels. Quando houver backend, esta lista
// passa a vir da API (ex.: fetch('/api/videos?categoria=sports')).
import bmpoliuspAvatar from '../assets/reels/avatars/bmpoliusp.png'
import sosomarianoAvatar from '../assets/reels/avatars/sosomariano.png'
import rafaelcarnauskasAvatar from '../assets/reels/avatars/rafaelcarnauskas.png'
import mendesvictorAvatar from '../assets/reels/avatars/mendesvictor.png'
import marcolinocarlosAvatar from '../assets/reels/avatars/marcolinocarlos.png'
import terylucasAvatar from '../assets/reels/avatars/terylucas.png'
import lauramatthewsAvatar from '../assets/reels/avatars/lauramatthews.png'
import harryprescottAvatar from '../assets/reels/avatars/harryprescott.png'
import ednamanzAvatar from '../assets/reels/avatars/ednamanz.png'
import christinasterlingAvatar from '../assets/reels/avatars/christinasterling.png'
import sports1 from '../assets/reels/posts/sports-1.png'
import sports2 from '../assets/reels/posts/sports-2.png'
import sports3 from '../assets/reels/posts/sports-3.png'
import cute1 from '../assets/reels/posts/cute-1.png'
import cute2 from '../assets/reels/posts/cute-2.png'
import cute3 from '../assets/reels/posts/cute-3.png'

export const reels = [
  {
    id: 'sports-1',
    category: 'sports',
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
    category: 'sports',
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
    category: 'sports',
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
    category: 'cute',
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
    category: 'cute',
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
    category: 'cute',
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
