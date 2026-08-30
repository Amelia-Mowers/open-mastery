/** GitHub-Pages demo entry: the app with the backend rolled into the browser.
 * No service worker, no server — SiteCore + localStorage, base-relative. */
import { createRoot } from 'react-dom/client'
import type { Bundle } from '@openmastery/schema'
import { App } from '../app/App'
import { DemoApi } from './DemoApi'
import bundleJson from './bundle.json'
import '../app/styles.css'
import { watchForNewBuild } from './watch-build'

const bundle = bundleJson as unknown as Bundle

createRoot(document.getElementById('root')!).render(
  <App demoBanner apiFactory={(_base, student) => new DemoApi(student, bundle)} />,
)

// A tab left open keeps serving the build it loaded with, so a review can
// easily be of code already replaced. Watch for a new deploy and offer the
// reload rather than forcing it — a silent refresh mid-problem would throw
// away whatever the student was typing.
watchForNewBuild()
