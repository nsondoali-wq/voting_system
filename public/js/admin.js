document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('candidate-form');
  const positionSelect = document.getElementById('position');
  const electionSelect = document.getElementById('election');

  // Fetch positions
  fetch('/admin/positions')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        data.data.forEach(pos => {
          const option = document.createElement('option');
          option.value = pos;
          option.textContent = pos.charAt(0).toUpperCase() + pos.slice(1);
          positionSelect.appendChild(option);
        });
      }
    })
    .catch(err => console.error('Error fetching positions:', err));

  // Fetch elections
  fetch('/admin/elections')
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        data.data.forEach(elec => {
          const option = document.createElement('option');
          option.value = elec.name;
          option.textContent = elec.name;
          electionSelect.appendChild(option);
        });
      }
    })
    .catch(err => console.error('Error fetching elections:', err));

  // Form submission
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const formData = new FormData(form);

    // Convert checkboxes to 1/0
    formData.set('eligibility', formData.get('eligibility') ? 1 : 0);
    formData.set('agreement', formData.get('agreement') ? 1 : 0);

    try {
      const res = await fetch('/admin/candidates', {
        method: 'POST',
        body: formData
      });
      const result = await res.json();
      if (result.success) {
        alert('Candidate added successfully!');
        form.reset();
      } else {
        alert('Error: ' + result.message);
      }
    } catch (err) {
      console.error('Submission error:', err);
      alert('Submission failed. Check console.');
    }
  });
});
