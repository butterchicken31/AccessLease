
# AccessLease

**Identify, review, and audit temporary access permissions that have outlived their purpose.**

AccessLease is a cybersecurity project developed for **Code-e-Manipal 2.0**. It demonstrates how organizations can audit access permissions, identify potential security risks, and manage access reviews through a centralized dashboard.

The project uses mock data to simulate an access-governance workflow, helping demonstrate how expired permissions, excessive privileges, and incomplete access records can be identified and reviewed.

## Features

- **Access auditing:** Analyze sample access grants and delegated permissions against defined security policies.
- **Risk identification:** Flag expired access, overly broad permissions, missing owners, missing expiry dates, and other potential policy issues supported by the audit rules.
- **Prioritized review queue:** Organize findings by risk and review priority.
- **Policy explanations:** Display findings with supporting details to help reviewers understand why an item needs attention.
- **Review workflow:** Simulate actions such as revoking access, extending expiry dates, and accepting documented exceptions, subject to the configured workflow rules.
- **Audit trail:** Record reviewer decisions and relevant changes in a hash-linked log that can help detect modifications to previous entries.
- **Permission graph:** Visualize relationships between identities and resources.
- **Demo datasets:** Explore sample scenarios without connecting to real organizational accounts.
- **AI-assisted support:** Optionally use the Groq API for the AI assistant when a valid API key is configured.

## How It Works

1. **Load a dataset:** Start with one of the project's sample access datasets.
2. **Analyze permissions:** Evaluate access records against the configured policies.
3. **Review findings:** Examine flagged permissions, their risk levels, and the reasons behind them.
4. **Take a simulated action:** Apply an available review decision, such as revocation or an expiry extension.
5. **Inspect the audit log:** Review recorded actions and check the integrity of the hash-linked entries.

AccessLease distinguishes between confirmed policy violations and records that need further review because information is missing or incomplete.

## Technology Stack

- **Frontend:** Next.js, React, CSS
- **Backend logic:** JavaScript, Next.js API routes
- **AI integration:** Groq API (optional)
- **Testing:** Automated tests for audit and findings functionality
- **Version control:** Git and GitHub

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- A Groq API key only if you want to use the optional AI assistant

### Installation

Clone the repository and navigate to the project directory:

```bash
git clone https://github.com/butterchicken31/AccessLease.git
cd AccessLease
```

Install dependencies:

```bash
npm install
```

Create your local environment file by copying `.env.example` to `.env.local`. Add your own Groq API key to `.env.local` if you want to enable the AI assistant.

Example `.env.local` configuration:

```env
GROQ_API_KEY=your_actual_api_key
GROQ_MODEL=openai/gpt-oss-120b
```

**Security note:** Never commit `.env.local` or expose your API key in public repositories, screenshots, or shared code.

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

Run the available automated tests using the test script configured in `package.json`. For example, if the project uses Node's built-in test runner:

```bash
npm test
```

## Limitations

- The project operates on **mock access data** and does not connect to real identity providers or organizational accounts.
- Workflow changes are simulated and are not actual changes to user permissions in external systems.
- The current in-memory state may reset when the server restarts or when requests are handled by different serverless instances.
- Hash-linked audit entries are designed as a tamper-detection demonstration; they are not a substitute for a secure, independently stored production audit system.

## Team

Developed for **Code-e-Manipal 2.0 — Cybersecurity Track**.

- **Arjun Atroley** — Team Lead
- Divy Purswani
- Dhruav Khosa
- Raghav Gupta
- Daksh Negi
- Vedansh Jakhetiya

## Disclaimer

AccessLease is a demonstration project intended for educational and evaluation purposes. It uses mock data and should not be treated as a production access-management or security-auditing system.
