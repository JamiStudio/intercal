Tightened the Workstream 4 corpus verifier so the first-proof query set now exercises point-in-time
`get_entity` checks for ChatGPT, Claude, Gemini, and Llama, not only ChatGPT. The gate requires
returned facts to fall inside the requested valid-world window.
