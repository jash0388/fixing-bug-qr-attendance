n=int(input())
print("Prime" if n>1 and all(n%i for i in range(2,int(n**0.5)+1)) else "Not Prime")