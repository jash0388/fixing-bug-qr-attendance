start = int(input("Enter start: "))
end = int(input("Enter end: "))

perfect = [n for n in range(start, end + 1) if n > 1 and sum(i for i in range(1, n) if n % i == 0) == n]

print("Perfect numbers:", perfect)
print("Total perfect numbers:", len(perfect))