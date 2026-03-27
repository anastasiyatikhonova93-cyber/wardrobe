import { NavLink } from 'react-router-dom'
import { Shirt, ShoppingBag, LayoutGrid, User } from 'lucide-react'

const links = [
  { to: '/', icon: Shirt, label: 'Гардероб' },
  { to: '/shopping', icon: ShoppingBag, label: 'Хочу купить' },
  { to: '/outfits', icon: LayoutGrid, label: 'Образы' },
  { to: '/profile', icon: User, label: 'Профиль' },
]

export function NavBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-zinc-100 z-40">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 text-xs transition-colors ${isActive ? 'text-black' : 'text-zinc-400'}`
            }
          >
            <Icon size={20} strokeWidth={1.5} />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
