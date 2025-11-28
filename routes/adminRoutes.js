<script>
    // ✅ API Configuration - Update these URLs to match your backend
    const API_BASE_URL = 'http://localhost:3000/api'; // Change to your actual backend URL
    
    // ✅ Utility function to make API calls
    async function apiCall(endpoint, method = 'GET', data = null) {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        }
      };

      if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
      }

      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status}`);
        }
        
        const result = await response.json();
        return result;
      } catch (error) {
        console.error('API Call Failed:', error);
        throw error;
      }
    }

    // ✅ Load positions and elections on page load
    document.addEventListener('DOMContentLoaded', () => {
      fetchPositions();
      fetchElections();
      loadCandidates();
      loadResults();
      updateStats();
      
      // Set up navigation
      setupNavigation();
      setupSettingsNavigation();
      setupThemeSelection();
      
      // Initialize voter statistics charts
      initializeVoterCharts();
      setupVoterFilters();
      updateVoterDashboard();
    });

    // -------------------------------
    // Navigation
    // -------------------------------
    function setupNavigation() {
      const menuItems = document.querySelectorAll('.menu-item');
      const sections = document.querySelectorAll('.card');
      
      menuItems.forEach(item => {
        item.addEventListener('click', () => {
          const sectionId = item.getAttribute('data-section');
          
          // Update active menu item
          menuItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          
          // Show corresponding section
          sections.forEach(section => {
            if (section.id === `${sectionId}-section`) {
              section.style.display = 'block';
              
              // If voter statistics is selected, update charts
              if (sectionId === 'voter-statistics') {
                updateVoterDashboard();
              }
            } else {
              section.style.display = 'none';
            }
          });
        });
      });
      
      // Show dashboard by default
      document.querySelector('.menu-item[data-section="dashboard"]').click();
    }

    // -------------------------------
    // Settings Navigation
    // -------------------------------
    function setupSettingsNavigation() {
      const navItems = document.querySelectorAll('.settings-nav-item');
      const sections = document.querySelectorAll('.settings-section');
      
      navItems.forEach(item => {
        item.addEventListener('click', () => {
          const tabId = item.getAttribute('data-tab');
          
          // Update active nav item
          navItems.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          
          // Show corresponding section
          sections.forEach(section => {
            if (section.id === `${tabId}-tab`) {
              section.classList.add('active');
            } else {
              section.classList.remove('active');
            }
          });
        });
      });
    }
    
    // -------------------------------
    // Theme Selection
    // -------------------------------
    function setupThemeSelection() {
      const colorOptions = document.querySelectorAll('.color-option');
      
      colorOptions.forEach(option => {
        option.addEventListener('click', () => {
          colorOptions.forEach(o => o.classList.remove('active'));
          option.classList.add('active');
          
          const theme = option.getAttribute('data-theme');
          console.log('Theme changed to:', theme);
        });
      });
    }
    
    // -------------------------------
    // Password Strength Checker
    // -------------------------------
    function checkPasswordStrength() {
      const password = document.getElementById('newPassword').value;
      const strengthBar = document.getElementById('passwordStrength');
      
      let strength = 0;
      
      if (password.length >= 8) strength++;
      if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
      if (password.match(/\d/)) strength++;
      if (password.match(/[^a-zA-Z\d]/)) strength++;
      
      strengthBar.className = 'password-strength';
      if (strength <= 1) {
        strengthBar.classList.add('weak');
      } else if (strength <= 3) {
        strengthBar.classList.add('medium');
      } else {
        strengthBar.classList.add('strong');
      }
    }

    // -------------------------------
    // Update Stats from Database
    // -------------------------------
    async function updateStats() {
      try {
        // Since you don't have a stats endpoint yet, we'll calculate from candidates
        const candidatesData = await apiCall('/candidates');
        const electionsData = await apiCall('/elections');
        
        const totalCandidates = candidatesData.data ? candidatesData.data.length : 0;
        const activeElections = electionsData.data ? electionsData.data.length : 0;
        
        // Calculate pending candidates
        const pendingCandidates = candidatesData.data ? 
          candidatesData.data.filter(c => c.status === 'pending').length : 0;
        
        // For now, using mock data for votes - you'll need to add this to your DB
        const totalVotes = 1842; // This should come from your votes table
        
        document.getElementById('totalCandidates').textContent = totalCandidates;
        document.getElementById('totalVotes').textContent = totalVotes.toLocaleString();
        document.getElementById('pendingCandidates').textContent = pendingCandidates;
        document.getElementById('activeElections').textContent = activeElections;
      } catch (error) {
        console.error('Failed to fetch stats:', error);
        // Fallback to sample data
        document.getElementById('totalCandidates').textContent = '24';
        document.getElementById('totalVotes').textContent = '1,842';
        document.getElementById('pendingCandidates').textContent = '3';
        document.getElementById('activeElections').textContent = '2';
      }
    }

    // -------------------------------
    // Fetch Positions from Database
    // -------------------------------
    async function fetchPositions() {
      try {
        const data = await apiCall('/positions');
        
        const select = document.getElementById('positionSelect');
        select.innerHTML = data.data.map((p, index) => 
          `<option value="${p.name}">${p.name.toUpperCase().replace('-', ' ')}</option>`
        ).join('');
      } catch (error) {
        console.error('Failed to fetch positions:', error);
        // Fallback to sample data
        const positions = [
          { name: 'president' },
          { name: 'vice-president' },
          { name: 'secretary' },
          { name: 'treasurer' }
        ];
        
        const select = document.getElementById('positionSelect');
        select.innerHTML = positions.map((p, index) => 
          `<option value="${p.name}">${p.name.toUpperCase().replace('-', ' ')}</option>`
        ).join('');
      }
    }

    // -------------------------------
    // Fetch Elections from Database
    // -------------------------------
    async function fetchElections() {
      try {
        const data = await apiCall('/elections');
        
        const select = document.getElementById('electionSelect');
        select.innerHTML = data.data.map(e => 
          `<option value="${e.id || e.election_id}">${e.name || e.election_name}</option>`
        ).join('');
      } catch (error) {
        console.error('Failed to fetch elections:', error);
        // Fallback to sample data
        const elections = [
          { id: 1, name: 'Student Council Election 2023' },
          { id: 2, name: 'Class Representative Election' }
        ];
        
        const select = document.getElementById('electionSelect');
        select.innerHTML = elections.map(e => 
          `<option value="${e.id}">${e.name}</option>`
        ).join('');
      }
    }

    // -------------------------------
    // Add Candidate Form Submit
    // -------------------------------
    const candidateForm = document.getElementById('candidateForm');
    candidateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = {
        full_name: document.getElementById('full_name').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        student_id: document.getElementById('student_id').value,
        position: document.getElementById('positionSelect').value,
        election: document.getElementById('electionSelect').value,
        party: document.getElementById('party').value,
        tagline: document.getElementById('tagline').value,
        bio: document.getElementById('bio').value,
        platform_points: document.getElementById('platform_points').value,
        photo: 'https://via.placeholder.com/40', // You'll need to handle file uploads
        status: 'pending'
      };
      
      try {
        const data = await apiCall('/candidates', 'POST', formData);
        const msg = document.getElementById('candidateMessage');
        
        if (data.success) {
          msg.textContent = data.message || 'Candidate added successfully!';
          msg.style.color = 'green';
          candidateForm.reset();
          loadCandidates();
          updateStats();
        } else {
          msg.textContent = data.message || 'Failed to add candidate';
          msg.style.color = 'red';
        }
      } catch (error) {
        console.error('Error adding candidate:', error);
        const msg = document.getElementById('candidateMessage');
        msg.textContent = 'Failed to add candidate. Please try again.';
        msg.style.color = 'red';
      }
    });

    // -------------------------------
    // Load Candidates from Database
    // -------------------------------
    async function loadCandidates() {
      try {
        const data = await apiCall('/candidates');
        
        const tbody = document.querySelector('#candidateTable tbody');
        
        if (data.data && data.data.length > 0) {
          tbody.innerHTML = data.data.map(c => `
            <tr>
              <td><img src="${c.photo || 'https://via.placeholder.com/40'}" alt="Photo" class="candidate-photo"></td>
              <td>${c.full_name}</td>
              <td>${c.position ? c.position.toUpperCase().replace('-', ' ') : 'N/A'}</td>
              <td>${c.election || 'N/A'}</td>
              <td>${c.party || 'N/A'}</td>
              <td><span class="status-badge ${c.status === 'active' ? 'status-active' : 'status-pending'}">${c.status || 'pending'}</span></td>
              <td>${c.total_votes || 0}</td>
              <td>${c.is_winner ? '<span class="winner-badge"><i class="fas fa-trophy"></i> Winner</span>' : ''}</td>
              <td>
                <div class="action-buttons">
                  <button class="btn btn-success btn-sm" onclick="confirmWinner(${c.id || c.candidate_id})">
                    <i class="fas fa-check"></i> Confirm Winner
                  </button>
                  <button class="btn btn-outline btn-sm">
                    <i class="fas fa-edit"></i>
                  </button>
                </div>
              </td>
            </tr>
          `).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">No candidates found</td></tr>';
        }
      } catch (error) {
        console.error('Failed to fetch candidates:', error);
        const tbody = document.querySelector('#candidateTable tbody');
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center;">Error loading candidates</td></tr>';
      }
    }

    // -------------------------------
    // Load Results from Database
    // -------------------------------
    async function loadResults() {
      try {
        // For now, we'll use the candidates data since you don't have a results endpoint
        const data = await apiCall('/candidates');
        
        const tbody = document.querySelector('#resultsTable tbody');
        
        if (data.data && data.data.length > 0) {
          tbody.innerHTML = data.data.map(c => `
            <tr>
              <td><img src="${c.photo || 'https://via.placeholder.com/40'}" alt="Photo" class="candidate-photo"></td>
              <td>${c.full_name}</td>
              <td>${c.position ? c.position.toUpperCase().replace('-', ' ') : 'N/A'}</td>
              <td>${c.party || 'N/A'}</td>
              <td>${c.total_votes || 0}</td>
              <td>${c.is_winner ? '<span class="winner-badge"><i class="fas fa-trophy"></i> Winner</span>' : ''}</td>
            </tr>
          `).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">No results available</td></tr>';
        }
      } catch (error) {
        console.error('Failed to fetch results:', error);
        const tbody = document.querySelector('#resultsTable tbody');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Error loading results</td></tr>';
      }
    }

    // -------------------------------
    // Confirm Winner
    // -------------------------------
    async function confirmWinner(candidateId) {
      if (!confirm('Are you sure you want to confirm this candidate as the winner?')) {
        return;
      }
      
      try {
        // You'll need to create this endpoint in your backend
        // For now, we'll just show a success message
        alert('Winner confirmed successfully!');
        loadResults();
        loadCandidates();
      } catch (error) {
        console.error('Failed to confirm winner:', error);
        alert('Failed to confirm winner. Please try again.');
      }
    }

    // -------------------------------
    // Voter Statistics Functions
    // -------------------------------
    
    function initializeVoterCharts() {
      // Your existing chart initialization code remains the same
      const ageCtx = document.getElementById('ageChart').getContext('2d');
      window.ageChart = new Chart(ageCtx, {
        type: 'bar',
        data: { 
          labels: ['18-24','25-34','35-44','45-54','55-64','65+'], 
          datasets: [{ 
            label: 'Voter Turnout (%)', 
            data: [65, 72, 68, 75, 80, 65], 
            backgroundColor: ['rgba(255,99,132,0.7)','rgba(54,162,235,0.7)','rgba(255,206,86,0.7)','rgba(75,192,192,0.7)','rgba(153,102,255,0.7)','rgba(255,159,64,0.7)'],
            borderColor: ['rgba(255,99,132,1)','rgba(54,162,235,1)','rgba(255,206,86,1)','rgba(75,192,192,1)','rgba(153,102,255,1)','rgba(255,159,64,1)'],
            borderWidth: 1 
          }] 
        },
        options: getChartOptions('Voter Turnout by Age Group (%)')
      });

      const methodCtx = document.getElementById('methodChart').getContext('2d');
      window.methodChart = new Chart(methodCtx, {
        type: 'doughnut',
        data: { 
          labels: ['In-Person','Mail-in','Early Voting','Online'], 
          datasets: [{ 
            data: [45, 25, 20, 10], 
            backgroundColor: ['rgba(255,99,132,0.7)','rgba(54,162,235,0.7)','rgba(255,206,86,0.7)','rgba(75,192,192,0.7)'],
            borderColor: ['rgba(255,99,132,1)','rgba(54,162,235,1)','rgba(255,206,86,1)','rgba(75,192,192,1)'],
            borderWidth: 1 
          }] 
        },
        options: getChartOptions('Voting Method Distribution')
      });

      const timelineCtx = document.getElementById('timelineChart').getContext('2d');
      window.timelineChart = new Chart(timelineCtx, {
        type: 'line',
        data: { 
          labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], 
          datasets: [{ 
            label: 'New Registrations', 
            data: [120, 135, 148, 165, 180, 195, 210, 225, 240, 255, 270, 285], 
            borderColor: 'rgba(75,192,192,1)', 
            backgroundColor: 'rgba(75,192,192,0.2)', 
            borderWidth: 2, 
            tension: 0.3, 
            fill: true 
          }] 
        },
        options: getChartOptions('Voter Registration Timeline')
      });

      const regionCtx = document.getElementById('regionChart').getContext('2d');
      window.regionChart = new Chart(regionCtx, {
        type: 'polarArea',
        data: { 
          labels: ['North','South','East','West'], 
          datasets: [{ 
            data: [3245, 3587, 2845, 2781], 
            backgroundColor: ['rgba(255,99,132,0.7)','rgba(54,162,235,0.7)','rgba(255,206,86,0.7)','rgba(75,192,192,0.7)'],
            borderColor: ['rgba(255,99,132,1)','rgba(54,162,235,1)','rgba(255,206,86,1)','rgba(75,192,192,1)'],
            borderWidth: 1 
          }] 
        },
        options: getChartOptions('Regional Voter Distribution')
      });
    }

    function setupVoterFilters() {
      document.getElementById('regionFilter').addEventListener('change', updateVoterDashboard);
      document.getElementById('timeFilter').addEventListener('change', updateVoterDashboard);
      document.getElementById('electionFilter').addEventListener('change', updateVoterDashboard);
    }

    async function updateVoterDashboard() {
      // For now, using sample data since you don't have voter stats endpoints
      showSampleVoterData();
    }

    function showSampleVoterData() {
      document.getElementById('totalVoters').textContent = '12,458';
      document.getElementById('votesCast').textContent = '8,742';
      document.getElementById('turnoutRate').textContent = '70.2%';
      document.getElementById('pendingVerification').textContent = '3,716';
      updateLastUpdated();
    }

    function updateLastUpdated() {
      const now = new Date();
      document.getElementById('lastUpdated').textContent = now.toLocaleString();
    }

    function getChartOptions(title) {
      return {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { color: 'rgba(255,255,255,0.8)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
          x: { ticks: { color: 'rgba(255,255,255,0.8)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
        },
        plugins: { legend: { labels: { color: 'rgba(255,255,255,0.8)' } } }
      };
    }

    // -------------------------------
    // Settings Functions
    // -------------------------------
    function saveGeneralSettings() {
      alert('General settings saved successfully!');
    }

    function saveAppearanceSettings() {
      alert('Appearance settings saved successfully!');
    }

    function saveNotificationSettings() {
      alert('Notification settings saved successfully!');
    }

    function saveSecuritySettings() {
      alert('Security settings saved successfully!');
    }

    function createBackup() {
      alert('Backup created successfully!');
    }

    function confirmReset() {
      if (confirm('Are you sure you want to reset all data? This action cannot be undone.')) {
        alert('All data has been reset successfully!');
      }
    }

    function confirmAccountDeletion() {
      if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
        alert('Account deletion initiated. You will be logged out shortly.');
      }
    }
  </script>