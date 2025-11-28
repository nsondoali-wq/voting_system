const candidateForm = document.getElementById('candidate-form');

candidateForm.addEventListener('submit', function(e) {
  e.preventDefault();

  const platformPoints = [];
  document.querySelectorAll('.platform-input').forEach(input => {
    if (input.value.trim() !== '') platformPoints.push(input.value.trim());
  });

  const formData = {
    name: document.getElementById('candidate-name').value,
    email: document.getElementById('candidate-email').value,
    phone: document.getElementById('candidate-phone').value,
    student_id: document.getElementById('candidate-student-id').value,
    position_id: document.getElementById('candidate-position').value,
    election_id: document.getElementById('candidate-election').value,
    party: document.getElementById('candidate-party').value,
    status: document.getElementById('candidate-status').value,
    tagline: document.getElementById('candidate-tagline').value,
    bio: document.getElementById('candidate-bio').value,
    major: document.getElementById('candidate-major').value,
    year: document.getElementById('candidate-year').value,
    experience: document.getElementById('candidate-experience').value,
    platform: platformPoints,
    achievements: document.getElementById('candidate-achievements').value,
    manifesto: document.getElementById('candidate-manifesto').value,
    website: document.getElementById('candidate-website').value,
    social_media: document.getElementById('candidate-social').value,
    references: document.getElementById('candidate-references').value,
    campaign_manager: document.getElementById('candidate-campaign-manager').value,
    contact_person: document.getElementById('candidate-contact-person').value
  };

  fetch('/admin/candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData)
  })
  .then(res => res.json())
  .then(data => {
    alert(data.message);
    if (data.success) candidateForm.reset();
  })
  .catch(err => console.error(err));
});
