import { Routes } from '@angular/router';

import { Home } from './pages/home/home';
import { Products } from './pages/products/products';
import { ProductDetails } from './pages/product-details/product-details';
import { Cart } from './pages/cart/cart';
import { Login } from './pages/login/login';
import { Register } from './pages/register/register';
import { Checkout } from './pages/checkout/checkout';
import { TrackOrder } from './pages/track-order/track-order';
import { OrderHistory } from './pages/order-history/order-history';
import { ForgotPassword } from './pages/forgot-password/forgot-password';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [

  {
    path: '',
    component: Home
  },

  {
    path: 'products',
    component: Products
  },

  {
    path: 'product/:id',
    component: ProductDetails
  },

  {
    path: 'cart',
    component: Cart
  },

  {
    path: 'track-order',
    component: TrackOrder
  },

  {
    path: 'order-history',
    component: OrderHistory,
    canActivate: [authGuard]
  },

  {
    path: 'consultations',
    loadComponent: () => import('./pages/consultations/consultations').then(m => m.Consultations)
  },

  {
    path: 'my-consultations',
    loadComponent: () => import('./pages/my-consultations/my-consultations').then(m => m.MyConsultations),
    canActivate: [authGuard]
  },

  {
    path: 'returns',
    loadComponent: () => import('./pages/returns/customer-returns').then(m => m.CustomerReturns),
    canActivate: [authGuard]
  },

  {
    path: 'orders',
    redirectTo: 'order-history',
    pathMatch: 'full'
  },

  {
    path: 'profile',
    redirectTo: 'order-history',
    pathMatch: 'full'
  },

  {
    path: 'login',
    component: Login
  },

  {
    path: 'register',
    component: Register
  },

  {
    path: 'forgot-password',
    component: ForgotPassword
  },

  {
    path: 'checkout',
    component: Checkout
  },

  {
    path: 'admin',
    loadComponent: () => import('./admin/layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./admin/dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./admin/dashboard/dashboard').then(m => m.Dashboard)
      },
      {
        path: 'orders',
        loadComponent: () => import('./admin/orders/orders').then(m => m.AdminOrders)
      },
      {
        path: 'products',
        loadComponent: () => import('./admin/products/products').then(m => m.AdminProducts)
      },
      {
        path: 'categories',
        loadComponent: () => import('./admin/categories/categories').then(m => m.AdminCategories)
      },
      {
        path: 'inventory',
        loadComponent: () => import('./admin/inventory/inventory').then(m => m.Inventory)
      },
      {
        path: 'customers',
        loadComponent: () => import('./admin/customers/customers').then(m => m.AdminCustomers)
      },
      {
        path: 'returns',
        loadComponent: () => import('./admin/returns/returns').then(m => m.AdminReturns)
      },
      {
        path: 'notifications',
        loadComponent: () => import('./admin/notifications/notifications').then(m => m.AdminNotifications)
      },
      {
        path: 'reviews',
        loadComponent: () => import('./admin/reviews/reviews').then(m => m.AdminReviews)
      },
      {
        path: 'pickup-locations',
        loadComponent: () => import('./admin/pickup-locations/pickup-locations').then(m => m.AdminPickupLocations)
      },
      {
        path: 'horoscope',
        loadComponent: () => import('./admin/horoscope/horoscope').then(m => m.AdminHoroscope)
      },
      {
        path: 'consultations',
        loadComponent: () => import('./admin/consultations/consultations').then(m => m.AdminConsultations)
      },
      {
        path: 'reports/date-wise',
        loadComponent: () => import('./admin/reports/date-wise/date-wise-report').then(m => m.DateWiseReport)
      },
      {
        path: 'reports/sales',
        loadComponent: () => import('./admin/reports/date-wise/date-wise-report').then(m => m.DateWiseReport)
      },
      {
        path: 'reports',
        redirectTo: 'reports/date-wise',
        pathMatch: 'full'
      },
      {
        path: 'store-settings',
        loadComponent: () => import('./admin/profile/profile').then(m => m.AdminProfile)
      },
      {
        path: 'profile',
        loadComponent: () => import('./admin/profile/profile').then(m => m.AdminProfile)
      }
    ]
  },

  {
    path: '**',
    redirectTo: ''
  }

];