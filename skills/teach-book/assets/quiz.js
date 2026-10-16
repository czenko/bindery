// Reusable quiz widgets.
//
// Multiple choice:
//   <div class="quiz-item" data-answer="Labeling">
//     <p class="quiz-q">Question</p>
//     <div class="quiz-options" data-options="Organization|Labeling|Navigation|Search"></div>
//     <div class="quiz-feedback">Explanation</div>
//   </div>
//
// Free recall:
//   <div class="recall"><p>Prompt</p><div class="quiz-feedback">Answer</div></div>
//
// <div class="quiz-score"></div> shows a running score.
// <div class="answer-key"></div> is filled with every answer and explanation for print.

;(function () {
  const items = [...document.querySelectorAll('.quiz-item')]
  let answered = 0
  let correct = 0
  const score = document.querySelector('.quiz-score')
  const renderScore = () => {
    if (score)
      score.textContent = `${correct} of ${answered} correct · ${items.length - answered} left`
  }

  items.forEach((item, i) => {
    const q = item.querySelector('.quiz-q')
    q.insertAdjacentHTML('afterbegin', `<span class="quiz-num">Q${i + 1}</span>`)
    const box = item.querySelector('.quiz-options')
    const answer = item.dataset.answer
    box.dataset.options.split('|').forEach((opt) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = opt
      b.addEventListener('click', () => {
        if (item.classList.contains('answered')) return
        item.classList.add('answered')
        answered++
        if (opt === answer) correct++
        box.querySelectorAll('button').forEach((x) => {
          x.disabled = true
          if (x.textContent === answer) x.classList.add('correct')
          else if (x === b) x.classList.add('wrong')
        })
        renderScore()
      })
      box.appendChild(b)
    })
  })

  document.querySelectorAll('.recall').forEach((r) => {
    const ta = document.createElement('textarea')
    ta.placeholder = 'Write from memory first, then reveal.'
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'no-print'
    btn.textContent = 'Reveal'
    btn.addEventListener('click', () => r.classList.add('revealed'))
    const fb = r.querySelector('.quiz-feedback')
    r.insertBefore(ta, fb)
    r.insertBefore(btn, fb)
  })

  const key = document.querySelector('.answer-key')
  if (key) {
    const rows = items
      .map(
        (item, i) =>
          `<li><strong>Q${i + 1}: ${item.dataset.answer}.</strong> ${item.querySelector('.quiz-feedback').innerHTML}</li>`
      )
      .join('')
    const recalls = [...document.querySelectorAll('.recall .quiz-feedback')]
      .map((f) => `<li>${f.innerHTML}</li>`)
      .join('')
    key.innerHTML =
      '<h2>Answer key</h2>' +
      (recalls ? `<h3>Recall</h3><ul>${recalls}</ul>` : '') +
      (rows ? `<h3>Quiz</h3><ol style="list-style:none;padding:0">${rows}</ol>` : '')
  }

  renderScore()
})()
