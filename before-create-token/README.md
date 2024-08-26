# Before Create Token example

In this usecase we want to enforce a maximum number of token per users.

Before each token creation we will check the number of tokens already own by subject of then token.

If it exceeds a configured number, the token creation should fail.
