// src/csvTemplate.js

export function downloadUserTemplate() {
  const header = 'full_name,email,role,stage,courses,department_head_of'
  const exampleRows = [
    'Jane Smith,jane.smith@mes.edu.eg,teacher,,English/Grade 2;English/Grade 3,',
    'Ahmed Hassan,ahmed.hassan@mes.edu.eg,head,elementary,,',
    'Sara Ali,sara.ali@mes.edu.eg,head_department,,Math/Grade 4;Math/Grade 5,',
  ]
  const csv = [header, ...exampleRows].join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'user_upload_template.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
