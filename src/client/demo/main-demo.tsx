/** GitHub-Pages demo entry: the app with the backend rolled into the browser.
 * No service worker, no server — SiteCore + localStorage, base-relative. */
import { createRoot } from 'react-dom/client'
import type { Bundle } from '@openmastery/schema'
import { App } from '../app/App'
import { DemoApi } from './DemoApi'
import bundleJson from './bundle.json'
import '../app/styles.css'

const bundle = bundleJson as unknown as Bundle

createRoot(document.getElementById('root')!).render(
  <App demoBanner apiFactory={(_base, student) => new DemoApi(student, bundle)} />,
)
