import { Navigate, createBrowserRouter } from 'react-router-dom'
import Shell from './Shell'
import Overview, { OverviewDetail } from './pages/Overview'
import MyWork from './pages/MyWork'
import Brands from './pages/Brands'
import Styles from './pages/Styles'
import Vendors from './pages/Vendors'

export const router = createBrowserRouter([
  {
    path: '/', element: <Shell />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: 'overview', element: <Overview /> },
      { path: 'overview/work/:workId', element: <OverviewDetail /> },
      { path: 'my-work', element: <MyWork /> },
      { path: 'brands/*', element: <Brands /> },
      { path: 'styles/*', element: <Styles /> },
      { path: 'vendors/*', element: <Vendors /> },
      { path: '*', element: <Navigate to="/overview" replace /> },
    ],
  },
])
