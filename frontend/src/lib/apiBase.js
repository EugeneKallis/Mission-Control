export function getApiBase() {
  const host = window.location.hostname
  const isLocalDev = window.location.port === '5173' || host === 'localhost' || host === '127.0.0.1'

  if (isLocalDev) {
    return `http://${host}:5056`
  }

  return `${window.location.origin}/api`
}
