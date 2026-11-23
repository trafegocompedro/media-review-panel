import { expect, test } from 'claude-code/testing'

import { classify, classifyOutput, withoutHeredocs } from '../hooks/detect'

test('heredoc: writing a file that mentions an ad API is not a media call', () => {
  const writes = "python3 - <<'EOF'\nopen('notes.md', 'w').write('see https://graph.facebook.com/v20.0/act_123/insights and google_ads_report.py')\nEOF"
  expect(classify('Bash', { command: writes }, false)).toBeUndefined()

  const note = 'cat > notes.md <<EOF\ncurl https://googleads.googleapis.com/v19/customers/1234567890/googleAds:search\nEOF'
  expect(classify('Bash', { command: note }, false)).toBeUndefined()
  expect(withoutHeredocs(note)).toBe('cat > notes.md <<EOF')
})

test('heredoc: a media script fed through a heredoc still counts', () => {
  expect(classify('Bash', { command: 'python3 google_ads_report.py <<EOF\n7\nEOF' }, false)?.platform).toBe('Google Ads')
  expect(classify('Bash', { command: "python3 report.py --days 7 <<'EOF'\nyes\nEOF" }, false, ['report.py'])).toBeDefined()
})

test('heredoc: an inline script that does fetch ad data is still caught by what it prints', () => {
  const inline = "python3 - <<'EOF'\nimport requests\nprint(requests.get('https://graph.facebook.com/v20.0/act_123/insights').text)\nEOF"
  expect(classify('Bash', { command: inline }, false)).toBeUndefined()
  expect(classifyOutput(inline, '{"data":[{"campaign_name":"Sample","spend":"10"}]}')?.platform).toBe('Meta Ads')
})

test('heredoc: a heredoc with no end stays as it came', () => {
  const open = "python3 - <<'EOF'\nprint('https://graph.facebook.com')"
  expect(withoutHeredocs(open)).toBe(open)
})
