const TEXT_TO_SPEECH_RATE_PATTERN = /^\d+(?:\.\d{1,12})?$/
const MAXIMUM_TEXT_TO_SPEECH_RATE = '1000000'

export function isValidTextToSpeechRate(value: string): boolean {
  if (
    value.length > 64 ||
    !TEXT_TO_SPEECH_RATE_PATTERN.test(value)
  )
    return false

  const [whole = '', fraction = ''] = value.split('.')
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '')
  if (!/[1-9]/.test(`${normalizedWhole}${fraction}`)) return false

  if (normalizedWhole.length !== MAXIMUM_TEXT_TO_SPEECH_RATE.length) {
    return normalizedWhole.length < MAXIMUM_TEXT_TO_SPEECH_RATE.length
  }
  if (normalizedWhole !== MAXIMUM_TEXT_TO_SPEECH_RATE) {
    return normalizedWhole < MAXIMUM_TEXT_TO_SPEECH_RATE
  }
  return !/[1-9]/.test(fraction)
}
