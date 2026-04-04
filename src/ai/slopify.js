export function tokenEstimate(text) {
  return Math.ceil(text.length / 4);
}

export async function handleSlopify(mode) {
  const selection = window.getSelection()?.toString()?.trim();
  const readerText = document.getElementById('classic-reader')?.textContent?.trim() || '';
  const source = selection || readerText.slice(0, 5000);
  if (!source) {
    return;
  }

  const estimate = tokenEstimate(source);
  if (estimate > 1500) {
    alert(`This may use significant API quota (~${estimate} tokens)`);
  }

  alert(`AI ${mode} is scaffolded. Add your provider call and stream rendering next.`);
}
